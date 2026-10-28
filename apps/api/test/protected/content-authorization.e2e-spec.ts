/**
 * CP-01 content HTTP authorization e2e tests.
 *
 * Boots an ISOLATED Nest slice (real `AuthController` + `AuthGuard` +
 * `RoleGuard` + the real `ContentController` + `ContentExceptionFilter`) wired
 * to a fake in-memory content repository and fake identity — no PostgreSQL, no
 * Prisma, no network. Proves the CP-01 acceptance criterion END TO END over
 * HTTP: all authoring mutations require TEACHER/ADMIN server-side authorization,
 * and per-object ownership is enforced (a TEACHER may mutate only their own
 * content; an ADMIN any).
 *
 * Matrix for a mutation route (POST /content/courses):
 *
 *   | Caller    | create course |
 *   |-----------|---------------|
 *   | Anonymous | 401           |
 *   | STUDENT   | 403           |
 *   | TEACHER   | 201           |
 *   | ADMIN     | 201           |
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import {
  AuthService,
  type AuthServiceDeps,
} from '../../src/modules/identity/application/auth-service';
import {
  type AuthCandidate,
  type IdentityRepository,
} from '../../src/modules/identity/application/identity-repository';
import { LoginRateLimiter } from '../../src/modules/identity/application/login-rate-limiter';
import { type PasswordHasher } from '../../src/modules/identity/application/password-hasher';
import {
  type CreateSessionInput,
  type PersistedSession,
  type SessionRepository,
} from '../../src/modules/identity/application/session-repository';
import { AuthExceptionFilter } from '../../src/modules/identity/http/auth-exception.filter';
import {
  AUTH_CONTROLLER_OPTIONS,
  AuthController,
} from '../../src/modules/identity/http/auth.controller';
import { AuthGuard } from '../../src/modules/identity/http/auth.guard';
import { RoleGuard } from '../../src/modules/identity/http/role.guard';
import { parsePublicUserId, type PublicUserId, type Role } from '../../src/modules/identity/domain';
import { ContentService } from '../../src/modules/content/application/content-service';
import { CONTENT_PUBLIC_ID_GENERATOR } from '../../src/modules/content/application/tokens';
import { ContentController } from '../../src/modules/content/http/content.controller';
import { FakeContentRepository, makeContentService } from '../support/fake-content-repository';
import { createTestApp, type TestAppContext } from '../support/test-app';

const PASSWORD = 'synthetic-password-0000';
const STORED_HASH = 'scrypt$N=1024,r=8,p=1$c2FsdA==$aGFzaA==';

function publicIdFor(seed: number): PublicUserId {
  const hex = seed.toString(16).padStart(2, '0');
  return parsePublicUserId(`11111111-1111-4111-8111-1111111111${hex}`);
}

class FakeHasher implements PasswordHasher {
  readonly algorithm = 'scrypt';
  async hash(): Promise<never> {
    throw new Error('not used');
  }
  async verify(plain: string): Promise<boolean> {
    return plain === PASSWORD;
  }
}

function candidate(userId: string, login: string, roles: Role[], idSeed: number): AuthCandidate {
  return {
    userId,
    publicId: publicIdFor(idSeed),
    login,
    loginNormalized: login,
    state: 'ACTIVE',
    roles,
    credential: { algorithm: 'scrypt', parameters: { N: 1024, r: 8, p: 1 }, hash: STORED_HASH },
  };
}

class InMemoryIdentity implements IdentityRepository {
  constructor(private readonly users: Map<string, AuthCandidate>) {}
  publicIdOf(userId: string): PublicUserId {
    return this.users.get(userId)?.publicId ?? publicIdFor(0);
  }
  async findAuthCandidateByNormalizedLogin(login: string): Promise<AuthCandidate | null> {
    for (const u of this.users.values()) if (u.loginNormalized === login) return u;
    return null;
  }
  async findRolesByUserId(userId: string): Promise<Role[]> {
    return this.users.get(userId)?.roles ? [...this.users.get(userId)!.roles] : [];
  }
  async findById(userId: string): Promise<AuthCandidate | null> {
    return this.users.get(userId) ?? null;
  }
}

class InMemorySessions implements SessionRepository {
  readonly rows = new Map<string, PersistedSession>();
  private seq = 0;
  constructor(private readonly publicIdOf: (userId: string) => PublicUserId) {}
  async findByTokenHash(tokenHash: string): Promise<PersistedSession | null> {
    for (const row of this.rows.values()) if (row.tokenHash === tokenHash) return row;
    return null;
  }
  async create(input: CreateSessionInput): Promise<PersistedSession> {
    const id = `sess-${++this.seq}`;
    const row: PersistedSession = {
      id,
      userPublicId: this.publicIdOf(input.userId),
      revokedAt: null,
      ...input,
    };
    this.rows.set(id, row);
    return row;
  }
  async touch(sessionId: string, at: Date): Promise<PersistedSession> {
    const row = this.rows.get(sessionId)!;
    const updated = { ...row, lastUsedAt: at };
    this.rows.set(sessionId, updated);
    return updated;
  }
  async revoke(sessionId: string, at: Date): Promise<void> {
    const row = this.rows.get(sessionId);
    if (row) this.rows.set(sessionId, { ...row, revokedAt: at });
  }
  async revokeAllForUser(userId: string, at: Date): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId && row.revokedAt === null) {
        this.rows.set(id, { ...row, revokedAt: at });
        n += 1;
      }
    }
    return n;
  }
}

const SEEDS = {
  student: candidate('u-student', 'student.one', ['STUDENT'], 1),
  teacher: candidate('u-teacher', 'teacher.one', ['TEACHER'], 2),
  otherTeacher: candidate('u-teacher-2', 'teacher.two', ['TEACHER'], 4),
  admin: candidate('u-admin', 'admin.one', ['ADMIN'], 3),
};

/** Build an isolated Nest module for the content slice with fake ports. */
function buildSlice() {
  const users = new Map<string, AuthCandidate>(Object.values(SEEDS).map((u) => [u.userId, u]));
  const identity = new InMemoryIdentity(users);
  const sessions = new InMemorySessions((userId) => identity.publicIdOf(userId));
  const contentRepo = new FakeContentRepository();

  const deps: AuthServiceDeps = {
    identity,
    sessions,
    hasher: new FakeHasher(),
    rateLimiter: new LoginRateLimiter({ windowMs: 60_000, maxAttempts: 1000, maxKeys: 100 }),
    sessionTtlMs: 60 * 60 * 1000,
    now: () => new Date('2026-10-16T03:00:00.000Z'),
  };

  let seq = 0;

  @Module({
    controllers: [AuthController, ContentController],
    providers: [
      { provide: AuthService, useFactory: () => new AuthService(deps) },
      {
        provide: ContentService,
        useFactory: () => makeContentService(contentRepo, () => `gen-${++seq}`),
      },
      { provide: CONTENT_PUBLIC_ID_GENERATOR, useValue: () => `gen-${++seq}` },
      AuthGuard,
      RoleGuard,
      {
        provide: AUTH_CONTROLLER_OPTIONS,
        useValue: { nodeEnv: 'production', sessionTtlMinutes: 60 },
      },
      { provide: APP_FILTER, useClass: AuthExceptionFilter },
    ],
  })
  class ContentSliceModule {}

  return { module: ContentSliceModule, sessions, identity, users, contentRepo };
}

function parseSetCookies(headers: Record<string, unknown>): Record<string, string> {
  const raw = (headers['set-cookie'] as string[] | undefined) ?? [];
  const out: Record<string, string> = {};
  for (const line of raw) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq)] = line.slice(eq + 1).split(';')[0];
  }
  return out;
}

function sessionCookies(headers: Record<string, unknown>): string {
  const cookies = parseSetCookies(headers);
  return `clp_session=${cookies.clp_session}; clp_csrf=${cookies.clp_csrf}`;
}
function csrfOf(cookie: string): string {
  return decodeURIComponent(cookie.split('clp_csrf=')[1] ?? '');
}

describe('content HTTP authorization (isolated slice, no DB)', () => {
  let ctx: TestAppContext;
  const cookie: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp({ metadata: { imports: [buildSlice().module] } });
    for (const [label, seed] of Object.entries(SEEDS)) {
      const res = await ctx.http
        .post('/auth/login')
        .send({ login: seed.login, password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(res.headers as Record<string, unknown>);
      cookie[label] = `clp_session=${cookies['clp_session']}; clp_csrf=${cookies['clp_csrf']}`;
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  const courseBody = { slug: 'greetings', title: 'Greetings' };

  it.each([
    '/content/courses',
    '/content/courses/parent/units',
    '/content/units/parent/lessons',
    '/content/items',
    '/content/lessons/parent/items',
  ])(
    '%s rejects missing, mismatched and other-session CSRF before service writes',
    async (route) => {
      const service = ctx.app.get(ContentService);
      const writes = [
        'createCourse',
        'createUnit',
        'createLesson',
        'createItem',
        'attachItemToLesson',
      ] as const;
      const spies = writes.map((method) => jest.spyOn(service, method));
      try {
        for (const proof of [undefined, 'invalid-proof', csrfOf(cookie.admin)]) {
          const request = ctx.http.post(route).set('Cookie', cookie.teacher);
          if (proof) request.set('X-CSRF-Token', proof);
          const response = await request.send(courseBody);
          expect(response.status).toBe(403);
          expect(response.body.error.code).toBe('AUTH_CSRF_INVALID');
        }
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    },
  );

  it('GET content requires no CSRF proof', async () => {
    await ctx.http.get('/content/courses').set('Cookie', cookie.teacher.split(';')[0]).expect(200);
  });

  describe('POST /content/courses (author a course)', () => {
    it('anonymous → 401 AUTH_REQUIRED', async () => {
      const res = await ctx.http.post('/content/courses').send(courseBody);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('STUDENT → 403 AUTH_FORBIDDEN', async () => {
      const res = await ctx.http
        .post('/content/courses')
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrfOf(cookie.student))
        .send(courseBody);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    it('TEACHER → 201 with a public id (no internal id surfaced)', async () => {
      const res = await ctx.http
        .post('/content/courses')
        .set('Cookie', cookie.teacher)
        .set('X-CSRF-Token', csrfOf(cookie.teacher))
        .send(courseBody);
      expect(res.status).toBe(201);
      expect(res.body.publicId).toBeDefined();
      expect(res.body.id).toBeUndefined();
      expect(res.body.visibility).toBe('DRAFT');
    });

    it('ADMIN → 201', async () => {
      const res = await ctx.http
        .post('/content/courses')
        .set('Cookie', cookie.admin)
        .set('X-CSRF-Token', csrfOf(cookie.admin))
        .send({ slug: 'admin-course', title: 'Admin Course' });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /content/items (author a learning item) — validation → 400', () => {
    it('a TEACHER supplying an incomplete VOCABULARY gets a safe 400', async () => {
      const res = await ctx.http
        .post('/content/items')
        .set('Cookie', cookie.teacher)
        .set('X-CSRF-Token', csrfOf(cookie.teacher))
        .send({ kind: 'VOCABULARY', simplified: '你好', meaning: 'hello' }); // missing pinyin
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONTENT_VALIDATION_FAILED');
      // Safe message: no SQL/ORM text.
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|sql|stack/i);
    });

    it('a STUDENT cannot author items → 403', async () => {
      const res = await ctx.http
        .post('/content/items')
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrfOf(cookie.student))
        .send({ kind: 'VOCABULARY', simplified: '你好', pinyin: 'nǐ hǎo', meaning: 'hello' });
      expect(res.status).toBe(403);
    });
  });

  describe('per-object ownership on lesson-item association', () => {
    it('another TEACHER cannot attach to a lesson they do not own → 403; owner/admin may', async () => {
      const slice = buildSlice();
      const local = await createTestApp({ metadata: { imports: [slice.module] } });
      try {
        const owner = await local.http
          .post('/auth/login')
          .send({ login: SEEDS.teacher.login, password: PASSWORD })
          .expect(200);
        const ownerCookie = sessionCookies(owner.headers as Record<string, unknown>);
        const other = await local.http
          .post('/auth/login')
          .send({ login: SEEDS.otherTeacher.login, password: PASSWORD })
          .expect(200);
        const otherCookie = sessionCookies(other.headers as Record<string, unknown>);
        const admin = await local.http
          .post('/auth/login')
          .send({ login: SEEDS.admin.login, password: PASSWORD })
          .expect(200);
        const adminCookie = sessionCookies(admin.headers as Record<string, unknown>);

        const course = await local.http
          .post('/content/courses')
          .set('Cookie', ownerCookie)
          .set('X-CSRF-Token', csrfOf(ownerCookie))
          .send({ slug: 'c1', title: 'C1' })
          .expect(201);
        const unit = await local.http
          .post(`/content/courses/${course.body.publicId}/units`)
          .set('Cookie', ownerCookie)
          .set('X-CSRF-Token', csrfOf(ownerCookie))
          .send({ slug: 'u1', title: 'U1' })
          .expect(201);
        const lesson = await local.http
          .post(`/content/units/${unit.body.publicId}/lessons`)
          .set('Cookie', ownerCookie)
          .set('X-CSRF-Token', csrfOf(ownerCookie))
          .send({ slug: 'l1', title: 'L1' })
          .expect(201);
        const item = await local.http
          .post('/content/items')
          .set('Cookie', ownerCookie)
          .set('X-CSRF-Token', csrfOf(ownerCookie))
          .send({ kind: 'CHARACTER', simplified: '一', pinyin: 'yī', meaning: 'one' })
          .expect(201);

        const attach = (c: string) =>
          local.http
            .post(`/content/lessons/${lesson.body.publicId}/items`)
            .set('Cookie', c)
            .set('X-CSRF-Token', csrfOf(c))
            .send({ learningItemPublicId: item.body.publicId, position: 0 });

        expect((await attach(otherCookie)).status).toBe(403);
        expect((await attach(ownerCookie)).status).toBe(204);
        // The owner already attached at position 0; ADMIN may attach a different
        // item, so just assert the admin is NOT forbidden (ownership unrestricted).
        const second = await local.http
          .post('/content/items')
          .set('Cookie', ownerCookie)
          .set('X-CSRF-Token', csrfOf(ownerCookie))
          .send({ kind: 'CHARACTER', simplified: '二', pinyin: 'èr', meaning: 'two' })
          .expect(201);
        const adminRes = await local.http
          .post(`/content/lessons/${lesson.body.publicId}/items`)
          .set('Cookie', adminCookie)
          .set('X-CSRF-Token', csrfOf(adminCookie))
          .send({ learningItemPublicId: second.body.publicId, position: 1 });
        expect(adminRes.status).toBe(204);
      } finally {
        await local.close();
      }
    });
  });

  describe('read visibility', () => {
    it('a student does not see a DRAFT course but a teacher does', async () => {
      const slice = buildSlice();
      const local = await createTestApp({ metadata: { imports: [slice.module] } });
      try {
        const teacher = await local.http
          .post('/auth/login')
          .send({ login: SEEDS.teacher.login, password: PASSWORD })
          .expect(200);
        const teacherCookie = sessionCookies(teacher.headers as Record<string, unknown>);
        const student = await local.http
          .post('/auth/login')
          .send({ login: SEEDS.student.login, password: PASSWORD })
          .expect(200);
        const studentCookie = sessionCookies(student.headers as Record<string, unknown>);

        await local.http
          .post('/content/courses')
          .set('Cookie', teacherCookie)
          .set('X-CSRF-Token', csrfOf(teacherCookie))
          .send({ slug: 'draft-only', title: 'Draft' })
          .expect(201);

        const asTeacher = await local.http
          .get('/content/courses')
          .set('Cookie', teacherCookie)
          .set('X-CSRF-Token', csrfOf(teacherCookie));
        expect(asTeacher.status).toBe(200);
        expect(asTeacher.body.map((c: { slug: string }) => c.slug)).toContain('draft-only');

        const asStudent = await local.http
          .get('/content/courses')
          .set('Cookie', studentCookie)
          .set('X-CSRF-Token', csrfOf(studentCookie));
        expect(asStudent.status).toBe(200);
        expect(asStudent.body.map((c: { slug: string }) => c.slug)).not.toContain('draft-only');
      } finally {
        await local.close();
      }
    });
  });
});
