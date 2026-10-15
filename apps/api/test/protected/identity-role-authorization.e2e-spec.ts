/**
 * Role authorization matrix e2e tests (CLP-00-07; ADR-004).
 *
 * Boots an ISOLATED Nest slice (real `AuthController` + `AuthGuard` + `RoleGuard`
 * + the representative CP-00 authorization routes) wired to in-memory fake
 * ports — no PostgreSQL, no Prisma, no network. Proves the required NEGATIVE
 * MATRIX server-side, end to end over HTTP:
 *
 *   | Caller    | auth-only | teacher-or-admin | admin-only |
 *   |-----------|-----------|------------------|------------|
 *   | Anonymous | 401       | 401              | 401        |
 *   | STUDENT   | 200       | 403              | 403        |
 *   | TEACHER   | 200       | 200              | 403        |
 *   | ADMIN     | 200       | 200              | 200        |
 *
 * It also asserts the 401/403 bodies leak no session/token/credential detail and
 * that authorization is decided server-side by the caller's CURRENT role
 * membership (a role change is picked up on the next request — no snapshot).
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
import { Cp00AuthorizationController } from '../../src/modules/identity/http/cp00-authorization.controller';
import { RoleGuard } from '../../src/modules/identity/http/role.guard';
import { parsePublicUserId, type PublicUserId, type Role } from '../../src/modules/identity/domain';
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
  admin: candidate('u-admin', 'admin.one', ['ADMIN'], 3),
};

/** Build an isolated Nest module for the authorization slice with fake ports. */
function buildSlice() {
  const users = new Map<string, AuthCandidate>(Object.values(SEEDS).map((u) => [u.userId, u]));
  const identity = new InMemoryIdentity(users);
  const sessions = new InMemorySessions((userId) => identity.publicIdOf(userId));

  const deps: AuthServiceDeps = {
    identity,
    sessions,
    hasher: new FakeHasher(),
    rateLimiter: new LoginRateLimiter({ windowMs: 60_000, maxAttempts: 1000, maxKeys: 100 }),
    sessionTtlMs: 60 * 60 * 1000,
    now: () => new Date('2026-10-15T12:00:00.000Z'),
  };

  @Module({
    controllers: [AuthController, Cp00AuthorizationController],
    providers: [
      { provide: AuthService, useFactory: () => new AuthService(deps) },
      AuthGuard,
      RoleGuard,
      {
        provide: AUTH_CONTROLLER_OPTIONS,
        useValue: { nodeEnv: 'production', sessionTtlMinutes: 60 },
      },
      { provide: APP_FILTER, useClass: AuthExceptionFilter },
    ],
  })
  class RoleSliceModule {}

  return { module: RoleSliceModule, sessions, identity, users, deps };
}

/** Parse a Set-Cookie header array into a map name → raw value. */
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

const ROUTES = {
  authOnly: '/internal/cp00/auth-only',
  teacherOrAdmin: '/internal/cp00/teacher-or-admin',
  adminOnly: '/internal/cp00/admin-only',
} as const;

describe('role authorization matrix (isolated slice, no DB)', () => {
  let ctx: TestAppContext;
  const sessionsByCaller: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp({ metadata: { imports: [buildSlice().module] } });
    // Establish one live session per caller via the real login route.
    for (const [label, seed] of Object.entries(SEEDS)) {
      const res = await ctx.http
        .post('/auth/login')
        .send({ login: seed.login, password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(res.headers as Record<string, unknown>);
      sessionsByCaller[label] = `clp_session=${cookies['clp_session']}`;
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('anonymous (no session)', () => {
    it.each(Object.values(ROUTES))('%s → 401 AUTH_REQUIRED', async (route) => {
      const res = await ctx.http.get(route);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' },
      });
    });
  });

  describe('STUDENT', () => {
    it('auth-only → 200', async () => {
      const res = await ctx.http.get(ROUTES.authOnly).set('Cookie', sessionsByCaller.student);
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('auth-only');
    });
    it('teacher-or-admin → 403 AUTH_FORBIDDEN', async () => {
      const res = await ctx.http.get(ROUTES.teacherOrAdmin).set('Cookie', sessionsByCaller.student);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: { code: 'AUTH_FORBIDDEN', message: 'Insufficient privileges.' },
      });
    });
    it('admin-only → 403 AUTH_FORBIDDEN', async () => {
      const res = await ctx.http.get(ROUTES.adminOnly).set('Cookie', sessionsByCaller.student);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });

  describe('TEACHER', () => {
    it('auth-only → 200', async () => {
      const res = await ctx.http.get(ROUTES.authOnly).set('Cookie', sessionsByCaller.teacher);
      expect(res.status).toBe(200);
    });
    it('teacher-or-admin → 200', async () => {
      const res = await ctx.http.get(ROUTES.teacherOrAdmin).set('Cookie', sessionsByCaller.teacher);
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('teacher-or-admin');
    });
    it('admin-only → 403 AUTH_FORBIDDEN', async () => {
      const res = await ctx.http.get(ROUTES.adminOnly).set('Cookie', sessionsByCaller.teacher);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });

  describe('ADMIN', () => {
    it('auth-only → 200', async () => {
      const res = await ctx.http.get(ROUTES.authOnly).set('Cookie', sessionsByCaller.admin);
      expect(res.status).toBe(200);
    });
    it('teacher-or-admin → 200', async () => {
      const res = await ctx.http.get(ROUTES.teacherOrAdmin).set('Cookie', sessionsByCaller.admin);
      expect(res.status).toBe(200);
    });
    it('admin-only → 200', async () => {
      const res = await ctx.http.get(ROUTES.adminOnly).set('Cookie', sessionsByCaller.admin);
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('admin-only');
    });
  });
});

describe('role authorization — 401/403 bodies leak nothing', () => {
  it('omits session/token/credential/role detail from 401 and 403 payloads', async () => {
    const slice = buildSlice();
    const ctx = await createTestApp({ metadata: { imports: [slice.module] } });
    try {
      const login = await ctx.http
        .post('/auth/login')
        .send({ login: SEEDS.student.login, password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(login.headers as Record<string, unknown>);
      const cookie = `clp_session=${cookies['clp_session']}`;

      const anon = await ctx.http.get(ROUTES.adminOnly);
      const forbidden = await ctx.http.get(ROUTES.adminOnly).set('Cookie', cookie);
      expect(anon.status).toBe(401);
      expect(forbidden.status).toBe(403);

      for (const res of [anon, forbidden]) {
        const text = JSON.stringify(res.body).toLowerCase();
        for (const leak of [
          'clp_session',
          'token',
          'csrf',
          'password',
          'hash',
          'student',
          'teacher',
          'admin',
          'role',
        ]) {
          expect(text).not.toContain(leak);
        }
      }
    } finally {
      await ctx.close();
    }
  });

  it('rejects a forged/unknown session with 401 (not 403) on a role route', async () => {
    const slice = buildSlice();
    const ctx = await createTestApp({ metadata: { imports: [slice.module] } });
    try {
      const res = await ctx.http
        .get(ROUTES.adminOnly)
        .set('Cookie', 'clp_session=forged-token-value-that-does-not-exist');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    } finally {
      await ctx.close();
    }
  });
});

describe('role authorization reads CURRENT membership (no snapshot)', () => {
  it('reflects a server-side role change on the next request', async () => {
    const slice = buildSlice();
    const ctx = await createTestApp({ metadata: { imports: [slice.module] } });
    try {
      // student.one logs in as STUDENT and is denied the admin route.
      const login = await ctx.http
        .post('/auth/login')
        .send({ login: SEEDS.student.login, password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(login.headers as Record<string, unknown>);
      const cookie = `clp_session=${cookies['clp_session']}`;

      const before = await ctx.http.get(ROUTES.adminOnly).set('Cookie', cookie);
      expect(before.status).toBe(403);

      // The SAME live session, but the user's membership changed server-side.
      const current = slice.users.get('u-student')!;
      slice.users.set('u-student', { ...current, roles: ['ADMIN'] });

      const after = await ctx.http.get(ROUTES.adminOnly).set('Cookie', cookie);
      expect(after.status).toBe(200);
      expect(after.body.route).toBe('admin-only');
    } finally {
      await ctx.close();
    }
  });
});
