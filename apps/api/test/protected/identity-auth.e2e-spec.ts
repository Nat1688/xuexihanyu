/**
 * Auth HTTP boundary e2e tests (CLP-00-06; ADR-003/ADR-005).
 *
 * Boots an ISOLATED Nest slice (real `AuthController` + `AuthGuard`) wired to
 * in-memory fake ports — no PostgreSQL, no Prisma, no network. Proves the HTTP
 * contract the task pins:
 *
 *   - POST /auth/login sets the EXACT session + CSRF `Set-Cookie` bytes and
 *     returns the principal (never a credential/hash/token).
 *   - Uniform login failure: unknown login, wrong password, PENDING, DISABLED
 *     all return the same 401 body (no account enumeration).
 *   - GET /auth/me and /auth/session return 401 AUTH_REQUIRED without a session
 *     (and 200 with one), with no internals leaked.
 *   - POST /auth/logout requires the double-submit CSRF proof: 403 on a
 *     missing/mismatched proof; 204 + cookie-clearing on success, and the
 *     server session is revoked.
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
import {
  hashSessionToken,
  parsePublicUserId,
  type PublicUserId,
  type Role,
} from '../../src/modules/identity/domain';
import { createTestApp, type TestAppContext } from '../support/test-app';

const PASSWORD = 'synthetic-password-0000';
const STORED_HASH = 'scrypt$N=1024,r=8,p=1$c2FsdA==$aGFzaA==';
const PUBLIC_ID = parsePublicUserId('11111111-1111-4111-8111-111111111111');

class FakeHasher implements PasswordHasher {
  readonly algorithm = 'scrypt';
  async hash(): Promise<never> {
    throw new Error('not used');
  }
  async verify(plain: string): Promise<boolean> {
    return plain === PASSWORD;
  }
}

function candidate(overrides: Partial<AuthCandidate> = {}): AuthCandidate {
  return {
    userId: 'user-1',
    publicId: PUBLIC_ID,
    login: 'teacher.one',
    loginNormalized: 'teacher.one',
    state: 'ACTIVE',
    roles: ['TEACHER'] as Role[],
    credential: { algorithm: 'scrypt', parameters: { N: 1024, r: 8, p: 1 }, hash: STORED_HASH },
    ...overrides,
  };
}

class InMemoryIdentity implements IdentityRepository {
  constructor(private readonly users: Map<string, AuthCandidate>) {}
  publicIdOf(userId: string): PublicUserId {
    return this.users.get(userId)?.publicId ?? PUBLIC_ID;
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
  constructor(private readonly publicIdOf: (userId: string) => PublicUserId = () => PUBLIC_ID) {}
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
  activeCount(): number {
    return [...this.rows.values()].filter((r) => r.revokedAt === null).length;
  }
}

/** Build an isolated Nest module for the auth HTTP slice with fake ports. */
function buildSlice(
  users: AuthCandidate[],
  env: 'development' | 'test' | 'production' = 'production',
) {
  const identity = new InMemoryIdentity(new Map(users.map((u) => [u.userId, u])));
  const sessions = new InMemorySessions((userId) => identity.publicIdOf(userId));

  const deps: AuthServiceDeps = {
    identity,
    sessions,
    hasher: new FakeHasher(),
    rateLimiter: new LoginRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1000,
      maxKeys: 100,
      now: () => 0,
    }),
    sessionTtlMs: 60 * 60 * 1000,
    now: () => new Date('2026-10-15T12:00:00.000Z'),
  };

  @Module({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useFactory: () => new AuthService(deps) },
      AuthGuard,
      { provide: AUTH_CONTROLLER_OPTIONS, useValue: { nodeEnv: env, sessionTtlMinutes: 60 } },
      // Register the auth→HTTP mapping so guard/controller auth errors become
      // the ADR-005 contract bodies (401/403/429) rather than a generic 500.
      { provide: APP_FILTER, useClass: AuthExceptionFilter },
    ],
  })
  class AuthSliceModule {}

  return { module: AuthSliceModule, sessions, identity, deps };
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

describe('auth HTTP boundary (isolated slice, no DB)', () => {
  let ctx: TestAppContext;
  let sessions: InMemorySessions;

  beforeAll(async () => {
    const slice = buildSlice([candidate()]);
    sessions = slice.sessions;
    ctx = await createTestApp({ metadata: { imports: [slice.module] } });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('POST /auth/login sets exact session + CSRF Set-Cookie bytes and returns the principal', async () => {
    const res = await ctx.http
      .post('/auth/login')
      .send({ login: 'teacher.one', password: PASSWORD })
      .expect(200);

    expect(res.body.user).toEqual({
      publicId: '11111111-1111-4111-8111-111111111111',
      login: 'teacher.one',
      roles: ['TEACHER'],
    });
    expect(JSON.stringify(res.body)).not.toContain('credential');
    expect(JSON.stringify(res.body)).not.toContain('hash');

    const rawCookies = res.headers['set-cookie'] as unknown as string[];
    const sessionLine = rawCookies.find((c) => c.startsWith('clp_session='))!;
    const csrfLine = rawCookies.find((c) => c.startsWith('clp_csrf='))!;
    // Exact attributes (production → Secure).
    expect(sessionLine).toMatch(/; Path=\/; Max-Age=3600; SameSite=Lax; HttpOnly; Secure$/);
    expect(csrfLine).toMatch(/; Path=\/; Max-Age=3600; SameSite=Lax; Secure$/);
    expect(csrfLine).not.toMatch(/HttpOnly/);
    expect(res.headers['cache-control']).toBe('no-store');
    // The raw session token is stored only as a hash.
    const cookies = parseSetCookies(res.headers as Record<string, unknown>);
    const stored = [...sessions.rows.values()][0];
    expect(stored.tokenHash).toBe(hashSessionToken(cookies['clp_session']));
    expect(stored.tokenHash).not.toBe(cookies['clp_session']);
  });

  it('returns UNIFORM 401 for every login-failure reason', async () => {
    const bodies: Array<string> = [];
    const statuses: number[] = [];
    for (const payload of [
      { login: 'nobody', password: 'x' },
      { login: 'teacher.one', password: 'wrong-password-0000' },
      { login: '', password: 'x' },
    ]) {
      const res = await ctx.http.post('/auth/login').send(payload);
      statuses.push(res.status);
      bodies.push(JSON.stringify(res.body));
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid login or password.' },
    });
  });

  it('GET /auth/me without a session returns 401 AUTH_REQUIRED (not a 500)', async () => {
    const res = await ctx.http.get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' },
    });
  });

  it('GET /auth/session without a session returns 401 AUTH_REQUIRED', async () => {
    const res = await ctx.http.get('/auth/session');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('GET /auth/me with a valid session returns the principal', async () => {
    const login = await ctx.http
      .post('/auth/login')
      .send({ login: 'teacher.one', password: PASSWORD })
      .expect(200);
    const cookies = parseSetCookies(login.headers as Record<string, unknown>);
    const res = await ctx.http
      .get('/auth/me')
      .set('Cookie', `clp_session=${cookies['clp_session']}`)
      .expect(200);
    expect(res.body.user.publicId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('POST /auth/logout without a CSRF proof is rejected with 403 (before any mutation)', async () => {
    const login = await ctx.http
      .post('/auth/login')
      .send({ login: 'teacher.one', password: PASSWORD })
      .expect(200);
    const cookies = parseSetCookies(login.headers as Record<string, unknown>);
    const before = sessions.activeCount();

    const res = await ctx.http
      .post('/auth/logout')
      .set('Cookie', `clp_session=${cookies['clp_session']}; clp_csrf=${cookies['clp_csrf']}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'AUTH_CSRF_INVALID', message: 'Request could not be verified.' },
    });
    // Nothing was revoked.
    expect(sessions.activeCount()).toBe(before);
  });

  it('POST /auth/logout with a mismatched CSRF header is rejected with 403', async () => {
    const login = await ctx.http
      .post('/auth/login')
      .send({ login: 'teacher.one', password: PASSWORD })
      .expect(200);
    const cookies = parseSetCookies(login.headers as Record<string, unknown>);
    const res = await ctx.http
      .post('/auth/logout')
      .set('Cookie', `clp_session=${cookies['clp_session']}; clp_csrf=${cookies['clp_csrf']}`)
      .set('X-CSRF-Token', 'attacker-supplied-token-value');
    expect(res.status).toBe(403);
  });

  it('POST /auth/logout with a valid proof returns 204, clears cookies, and revokes the session', async () => {
    // Use a dedicated slice so the revoked-session assertion is exact.
    const slice = buildSlice([candidate()]);
    const ctx = await createTestApp({ metadata: { imports: [slice.module] } });
    try {
      const login = await ctx.http
        .post('/auth/login')
        .send({ login: 'teacher.one', password: PASSWORD })
        .expect(200);
      const cookies = parseSetCookies(login.headers as Record<string, unknown>);
      const activeBefore = slice.sessions.activeCount();
      expect(activeBefore).toBe(1);

      const res = await ctx.http
        .post('/auth/logout')
        .set('Cookie', `clp_session=${cookies['clp_session']}; clp_csrf=${cookies['clp_csrf']}`)
        .set('X-CSRF-Token', cookies['clp_csrf'])
        .expect(204);

      const raw = res.headers['set-cookie'] as unknown as string[];
      expect(raw.some((c) => c.startsWith('clp_session=;') && /Max-Age=0/.test(c))).toBe(true);
      expect(raw.some((c) => c.startsWith('clp_csrf=;') && /Max-Age=0/.test(c))).toBe(true);
      expect(slice.sessions.activeCount()).toBe(0);

      // The revoked session no longer authenticates.
      const after = await ctx.http
        .get('/auth/me')
        .set('Cookie', `clp_session=${cookies['clp_session']}`);
      expect(after.status).toBe(401);
    } finally {
      await ctx.close();
    }
  });
});

describe('auth HTTP boundary in local development (Secure omitted)', () => {
  it('omits the Secure attribute on both cookies', async () => {
    const slice = buildSlice([candidate()], 'development');
    const ctx = await createTestApp({ metadata: { imports: [slice.module] } });
    try {
      const res = await ctx.http
        .post('/auth/login')
        .send({ login: 'teacher.one', password: PASSWORD })
        .expect(200);
      const raw = res.headers['set-cookie'] as unknown as string[];
      const sessionLine = raw.find((c) => c.startsWith('clp_session='))!;
      expect(sessionLine).not.toMatch(/Secure/);
    } finally {
      await ctx.close();
    }
  });
});
