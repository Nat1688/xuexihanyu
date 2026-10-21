/**
 * CP-05 student loop — HTTP end-to-end tests.
 *
 * Boots an ISOLATED Nest slice: the REAL `AuthController`, `AuthGuard`,
 * `RoleGuard`, `StudentController`, `StudentExceptionFilter` and `StudentService`,
 * wired to fake identity and fake CP-05 ports (no PostgreSQL, no Prisma, no
 * network). The CP-02 `ExerciseService` is real, driven by a fake reader.
 *
 * Proves over HTTP, for a signed-in STUDENT:
 *   - TODAY only ever returns PUBLISHED material (an unpublished lesson never
 *     appears, and no item/lesson from a draft is disclosed);
 *   - CONTINUE issues an exercise that carries NO answer key (and none of the
 *     internal ids), and anonymous / non-student callers are refused;
 *   - POST answers requires the CSRF double-submit proof;
 *   - answering is IDEMPOTENT on the submission token (identical body, one
 *     piece of evidence) and a different token afterwards is refused;
 *   - RESULT re-read is stable and reveals the expected value only afterwards;
 *   - another learner's session is indistinguishable from a missing one (404);
 *   - an empty corpus yields the first-class empty state (`STUDENT_NO_CONTENT`).
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ExerciseService } from '../../src/modules/exercise/application/exercise-service';
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
import { type LearningEventService } from '../../src/modules/learning-events/application/learning-event-service';
import { LearningEventConflictError } from '../../src/modules/learning-events/domain';
import { type MasteryService } from '../../src/modules/mastery/application/mastery-service';
import { type MasteryState } from '../../src/modules/mastery/domain';
import { StudentService } from '../../src/modules/student/application/student-service';
import {
  type AnswerSessionRecord,
  type AnswerSessionRepository,
  type AnswerSubmissionRecord,
  type NewAnswerSession,
  type NewAnswerSubmission,
  type SessionWithSubmission,
  type StudentContentReader,
  type StudentLesson,
  type StudentLessonItem,
  type StudentProgressReader,
  type StudentProjection,
} from '../../src/modules/student/application/student-ports';
import { StudentAlreadyAnsweredError } from '../../src/modules/student/domain';
import { StudentController } from '../../src/modules/student/http/student.controller';
import { StudentExceptionFilter } from '../../src/modules/student/http/student-exception.filter';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../../src/modules/identity/application/cookie-policy';
import { FakeExerciseContentReader } from '../support/fake-exercise-content-reader';
import { createTestApp, type TestAppContext } from '../support/test-app';

const PASSWORD = 'synthetic-password-0000';
const STORED_HASH = 'scrypt$N=1024,r=8,p=1$c2FsdA==$aGFzaA==';
const NOW = new Date('2026-10-17T10:00:00.000Z');
const TOKEN = 'token-0123456789abcdef';

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

// --- CP-05 fake ports -------------------------------------------------------

class FakeStudentContent implements StudentContentReader {
  readonly lessons = new Map<string, StudentLesson>();
  readonly items = new Map<string, StudentLessonItem[]>();

  add(lessonId: string, title: string, itemIds: readonly string[]): this {
    this.lessons.set(lessonId, {
      lessonPublicId: lessonId,
      title,
      unitPublicId: 'u1',
      coursePublicId: 'c1',
      position: this.lessons.size,
    });
    this.items.set(
      lessonId,
      itemIds.map((id) => ({ learningItemPublicId: id, simplified: id, pinyin: id, meaning: id })),
    );
    return this;
  }

  async listPublishedLessons(): Promise<StudentLesson[]> {
    return [...this.lessons.values()];
  }

  async listPublishedLessonItems(lessonPublicId: string): Promise<StudentLessonItem[] | null> {
    return this.items.get(lessonPublicId) ?? null;
  }
}

class FakeProgress implements StudentProgressReader {
  projections: StudentProjection[] = [];
  submissions = 0;
  async listProjections(): Promise<StudentProjection[]> {
    return [...this.projections];
  }
  async countSubmissionsSince(): Promise<number> {
    return this.submissions;
  }
}

class FakeSessionStore implements AnswerSessionRepository {
  readonly rows = new Map<string, AnswerSessionRecord>();
  readonly submissions = new Map<string, AnswerSubmissionRecord>();
  private sequence = 0;

  async create(input: NewAnswerSession): Promise<AnswerSessionRecord> {
    this.sequence += 1;
    const record: AnswerSessionRecord = {
      publicId: `st-session-${this.sequence}`,
      actorPublicId: input.actorPublicId,
      lessonPublicId: input.lessonPublicId,
      learningItemPublicId: input.learningItemPublicId,
      mode: input.mode,
      format: input.format,
      prompt: input.prompt,
      options: input.options,
      answerKey: input.answerKey,
      expiresAt: input.expiresAt,
      createdAt: NOW,
    };
    this.rows.set(record.publicId, record);
    return record;
  }

  async findByPublicId(id: string, actor: string): Promise<AnswerSessionRecord | null> {
    const row = this.rows.get(id);
    return row && row.actorPublicId === actor ? row : null;
  }

  async findWithSubmission(id: string, actor: string): Promise<SessionWithSubmission | null> {
    const session = await this.findByPublicId(id, actor);
    if (!session) return null;
    return { session, submission: this.submissions.get(id) ?? null };
  }

  async insertSubmission(input: NewAnswerSubmission): Promise<AnswerSubmissionRecord> {
    const existing = this.submissions.get(input.sessionPublicId);
    if (existing) {
      if (existing.submissionToken === input.submissionToken) return existing;
      throw new StudentAlreadyAnsweredError();
    }
    const record: AnswerSubmissionRecord = {
      submissionToken: input.submissionToken,
      submittedAnswer: input.submittedAnswer,
      correct: input.correct,
      feedback: input.feedback,
      expected: input.expected,
      received: input.received,
      learningEventPublicId: input.learningEventPublicId,
      createdAt: NOW,
    };
    this.submissions.set(input.sessionPublicId, record);
    return record;
  }

  async linkEvent(id: string, token: string, eventPublicId: string): Promise<void> {
    const row = this.submissions.get(id);
    if (!row || row.submissionToken !== token) throw new Error('submission not found');
    this.submissions.set(id, { ...row, learningEventPublicId: eventPublicId });
  }
}

const SEEDS = {
  student: candidate('u-student', 'student.one', ['STUDENT'], 1),
  other: candidate('u-student-2', 'student.two', ['STUDENT'], 2),
  teacher: candidate('u-teacher', 'teacher.one', ['TEACHER'], 3),
};

interface Slice {
  module: new () => unknown;
  content: FakeStudentContent;
  progress: FakeProgress;
  store: FakeSessionStore;
  events: { record: jest.Mock };
  mastery: { deriveForActor: jest.Mock };
}

/** Build the isolated student slice. `seed` decides what is "published". */
function buildSlice(seed: 'published' | 'empty'): Slice {
  const users = new Map<string, AuthCandidate>(Object.values(SEEDS).map((u) => [u.userId, u]));
  const identity = new InMemoryIdentity(users);
  const sessions = new InMemorySessions((userId) => identity.publicIdOf(userId));

  const content = new FakeStudentContent();
  if (seed === 'published') {
    // Two published lessons. `i1` is the item the learner will answer; the
    // "unpublished" lesson simply never enters the content port (CP-01 owns
    // the PUBLISHED gate) and therefore must never appear on TODAY.
    content.add('l1', 'Greetings', ['i1', 'i2']);
    content.add('l2', 'Numbers', ['i3']);
  }

  const progress = new FakeProgress();
  const store = new FakeSessionStore();

  const exerciseContent = new FakeExerciseContentReader();
  for (const id of ['i1', 'i2', 'i3']) {
    exerciseContent.addItem({
      learningItemPublicId: id,
      simplified: id,
      pinyin: `p-${id}`,
      meaning: `m-${id}`,
    });
  }
  exerciseContent.addLesson('l1', ['i1', 'i2']);
  exerciseContent.addLesson('l2', ['i3']);

  const events = {
    record: jest.fn(async (input: { publicId?: unknown }) => ({
      publicId: String(input.publicId),
    })),
  };

  const mastery = {
    deriveForActor: jest.fn(async () => {
      progress.projections = [
        { learningItemPublicId: 'i1', state: 'LEARNING' as MasteryState, dueAt: NOW },
      ];
    }),
  };

  const deps: AuthServiceDeps = {
    identity,
    sessions,
    hasher: new FakeHasher(),
    rateLimiter: new LoginRateLimiter({ windowMs: 60_000, maxAttempts: 1000, maxKeys: 100 }),
    sessionTtlMs: 60 * 60 * 1000,
    now: () => NOW,
  };

  const student = new StudentService({
    content,
    progress,
    sessions: store,
    exercises: new ExerciseService({ content: exerciseContent }),
    events: events as unknown as LearningEventService,
    mastery: mastery as unknown as MasteryService,
    mode: 'VI_TO_ZH',
    format: 'TYPING',
  });

  @Module({
    controllers: [AuthController, StudentController],
    providers: [
      { provide: AuthService, useFactory: () => new AuthService(deps) },
      { provide: StudentService, useValue: student },
      AuthGuard,
      RoleGuard,
      {
        provide: AUTH_CONTROLLER_OPTIONS,
        useValue: { nodeEnv: 'production', sessionTtlMinutes: 60 },
      },
      { provide: APP_FILTER, useClass: AuthExceptionFilter },
      { provide: APP_FILTER, useClass: StudentExceptionFilter },
    ],
  })
  class StudentSliceModule {}

  return {
    module: StudentSliceModule as unknown as new () => unknown,
    content,
    progress,
    store,
    events,
    mastery,
  };
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

/**
 * Build the Cookie header for a signed-in caller. The CSRF cookie is NOT
 * httpOnly, so a browser would read it from `document.cookie` and echo it in
 * the header — that is exactly what we simulate here (double submit).
 */
function cookieHeader(cookies: Record<string, string>): string {
  return `clp_session=${cookies[SESSION_COOKIE_NAME]}; clp_csrf=${cookies[CSRF_COOKIE_NAME]}`;
}

describe('student HTTP loop (isolated slice, no DB)', () => {
  let ctx: TestAppContext;
  let slice: Slice;
  const cookie: Record<string, string> = {};
  const csrf: Record<string, string> = {};

  beforeAll(async () => {
    slice = buildSlice('published');
    ctx = await createTestApp({ metadata: { imports: [slice.module] } });
    for (const [label, seed] of Object.entries(SEEDS)) {
      const res = await ctx.http
        .post('/auth/login')
        .send({ login: seed.login, password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(res.headers as Record<string, unknown>);
      cookie[label] = cookieHeader(cookies);
      csrf[label] = cookies[CSRF_COOKIE_NAME];
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /student/today', () => {
    it('anonymous → 401 AUTH_REQUIRED', async () => {
      const res = await ctx.http.get('/student/today');
      expect(res.status).toBe(401);
    });

    it('a TEACHER → 403 (student surface is STUDENT-only)', async () => {
      const res = await ctx.http.get('/student/today').set('Cookie', cookie.teacher);
      expect(res.status).toBe(403);
    });

    it('a STUDENT gets only published, learner-shaped entries', async () => {
      const res = await ctx.http.get('/student/today').set('Cookie', cookie.student);
      expect(res.status).toBe(200);
      expect(res.body.empty).toBe(false);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.entries.map((e: { lessonId: string }) => e.lessonId)).toEqual([
        'l1',
        'l1',
        'l2',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/answerKey|"answer"/i);
    });
  });

  describe('POST /student/exercises/next (CONTINUE)', () => {
    it('without the CSRF header → CSRF_INVALID (double submit enforced)', async () => {
      const res = await ctx.http
        .post('/student/exercises/next')
        .set('Cookie', cookie.student)
        .send();
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toMatch(/CSRF/i);
    });

    it('issues a session with NO answer key and no internal ids', async () => {
      const res = await ctx.http
        .post('/student/exercises/next')
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send();
      expect(res.status).toBe(201);
      expect(typeof res.body.sessionId).toBe('string');
      expect(res.body.prompt).toBe('m-i1');
      expect(res.body.alreadyAnswered).toBe(false);
      expect(res.headers['cache-control']).toBe('no-store');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/answerKey|answer:/);
      expect(res.body.actorPublicId).toBeUndefined();
    });
  });

  describe('EXERCISE → RESULT → idempotency', () => {
    let sessionId: string;

    it('CONTINUE again yields a fresh session', async () => {
      const res = await ctx.http
        .post('/student/exercises/next')
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send()
        .expect(201);
      sessionId = res.body.sessionId;
    });

    it('the exercise re-read still hides the answer key', async () => {
      const res = await ctx.http
        .get(`/student/exercises/${sessionId}`)
        .set('Cookie', cookie.student)
        .expect(200);
      expect(res.body.prompt).toBe('m-i1');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/answerKey|"answer"/i);
      expect(res.body).not.toHaveProperty('answer');
      expect(res.body).not.toHaveProperty('answerKey');
    });

    it('another learner sees it as not-found (no cross-learner read)', async () => {
      const res = await ctx.http.get(`/student/exercises/${sessionId}`).set('Cookie', cookie.other);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('STUDENT_SESSION_NOT_FOUND');
    });

    it('answering requires the CSRF header', async () => {
      const res = await ctx.http
        .post(`/student/exercises/${sessionId}/answers`)
        .set('Cookie', cookie.student)
        .send({ submissionToken: TOKEN, answer: 'i1' });
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toMatch(/CSRF/i);
    });

    it('a correct answer → RESULT with the expected value revealed', async () => {
      const res = await ctx.http
        .post(`/student/exercises/${sessionId}/answers`)
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send({ submissionToken: TOKEN, answer: 'i1' })
        .expect(200);
      expect(res.body.correct).toBe(true);
      expect(res.body.expected).toBe('i1');
      expect(res.body.received).toBe('i1');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(slice.events.record).toHaveBeenCalledTimes(1);
    });

    it('recovery requires CSRF, is owner-scoped and remains idempotent', async () => {
      await ctx.http
        .post(`/student/exercises/${sessionId}/result/recover`)
        .set('Cookie', cookie.student)
        .send()
        .expect(403);

      const other = await ctx.http
        .post(`/student/exercises/${sessionId}/result/recover`)
        .set('Cookie', cookie.other)
        .set('X-CSRF-Token', csrf.other)
        .send();
      expect(other.status).toBe(404);

      const before = slice.events.record.mock.calls.length;
      const [left, right] = await Promise.all([
        ctx.http
          .post(`/student/exercises/${sessionId}/result/recover`)
          .set('Cookie', cookie.student)
          .set('X-CSRF-Token', csrf.student)
          .send(),
        ctx.http
          .post(`/student/exercises/${sessionId}/result/recover`)
          .set('Cookie', cookie.student)
          .set('X-CSRF-Token', csrf.student)
          .send(),
      ]);
      expect(left.status).toBe(200);
      expect(right.status).toBe(200);
      expect(left.headers['cache-control']).toBe('no-store');
      expect(right.body).toEqual(left.body);
      expect(slice.events.record).toHaveBeenCalledTimes(before);
    });

    it('replaying the SAME token returns the identical result and appends NO evidence', async () => {
      const eventCallsBeforeGet = slice.events.record.mock.calls.length;
      const masteryCallsBeforeGet = slice.mastery.deriveForActor.mock.calls.length;
      const first = await ctx.http
        .get(`/student/exercises/${sessionId}/result`)
        .set('Cookie', cookie.student)
        .expect(200);
      expect(first.headers['cache-control']).toBe('no-store');
      expect(slice.events.record).toHaveBeenCalledTimes(eventCallsBeforeGet);
      expect(slice.mastery.deriveForActor).toHaveBeenCalledTimes(masteryCallsBeforeGet);
      const replay = await ctx.http
        .post(`/student/exercises/${sessionId}/answers`)
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send({ submissionToken: TOKEN, answer: 'i1' })
        .expect(200);
      expect(replay.body.correct).toBe(first.body.correct);
      expect(replay.body.expected).toBe(first.body.expected);
      expect(replay.body.submittedAt).toBe(first.body.submittedAt);
      expect(slice.events.record).toHaveBeenCalledTimes(1);
      expect(slice.store.submissions.size).toBe(1);
    });

    it('a DIFFERENT token afterwards → 409 STUDENT_ALREADY_ANSWERED', async () => {
      const res = await ctx.http
        .post(`/student/exercises/${sessionId}/answers`)
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send({ submissionToken: `${TOKEN}-2`, answer: 'i1' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STUDENT_ALREADY_ANSWERED');
    });

    it('a malformed token → 400 STUDENT_INVALID_TOKEN', async () => {
      const res = await ctx.http
        .post(`/student/exercises/${sessionId}/answers`)
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send({ submissionToken: 'x', answer: 'i1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('STUDENT_INVALID_TOKEN');
    });

    it('returns a safe HTTP 409 for semantic evidence collision', async () => {
      const next = await ctx.http
        .post('/student/exercises/next')
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send()
        .expect(201);
      slice.events.record.mockRejectedValueOnce(new LearningEventConflictError());

      const res = await ctx.http
        .post(`/student/exercises/${next.body.sessionId}/answers`)
        .set('Cookie', cookie.student)
        .set('X-CSRF-Token', csrf.student)
        .send({ submissionToken: `${TOKEN}-collision`, answer: 'i1' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STUDENT_SUBMISSION_CONFLICT');
      expect(JSON.stringify(res.body)).not.toMatch(/P2002|Prisma|publicId|outcome/i);
    });
  });
});

describe('student HTTP loop — empty corpus', () => {
  it('CONTINUE with nothing published → 200 empty state (STUDENT_NO_CONTENT)', async () => {
    const slice = buildSlice('empty');
    const app = await createTestApp({ metadata: { imports: [slice.module] } });
    try {
      const login = await app.http
        .post('/auth/login')
        .send({ login: SEEDS.student.login, password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(login.headers as Record<string, unknown>);
      const sessionCookie = cookieHeader(cookies);

      const today = await app.http.get('/student/today').set('Cookie', sessionCookie).expect(200);
      expect(today.body.empty).toBe(true);
      expect(today.body.entries).toEqual([]);

      const res = await app.http
        .post('/student/exercises/next')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', cookies[CSRF_COOKIE_NAME])
        .send();
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('STUDENT_NO_CONTENT');
    } finally {
      await app.close();
    }
  });
});
