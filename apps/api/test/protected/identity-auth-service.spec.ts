/**
 * AuthService unit tests (CLP-00-06; ADR-003/ADR-004).
 *
 * Drives the authentication use-cases against in-memory fakes (no DB, no HTTP)
 * to prove the behavioural guarantees the contract pins at the application
 * boundary:
 *
 *   - uniform failure for unknown login / wrong password / PENDING / DISABLED /
 *     no credential (all raise AuthenticationFailedError, indistinguishable);
 *   - successful login issues a fresh opaque token + CSRF token, and never
 *     returns or stores the raw password;
 *   - successful login ROTATES: a pre-existing valid session is revoked before
 *     the new one is created (session-fixation defence);
 *   - logout revokes server-side (idempotent, non-enumerating);
 *   - resolveSession rejects missing/malformed/expired/revoked tokens AND a
 *     token whose account is no longer ACTIVE, and advances lastUsedAt on
 *     success.
 *
 * Synthetic credentials only.
 */
import {
  AuthenticationFailedError,
  LoginRateLimitedError,
} from '../../src/modules/identity/application/auth-errors';
import {
  AuthService,
  loginRateLimitKey,
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
import {
  hashSessionToken,
  newSessionToken,
  parsePublicUserId,
  type PublicUserId,
  type Role,
} from '../../src/modules/identity/domain';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const PASSWORD = 'synthetic-password-0000';
const STORED_HASH = 'scrypt$N=1024,r=8,p=1$c2FsdA==$aGFzaA==';
const PUBLIC_ID = parsePublicUserId('11111111-1111-4111-8111-111111111111');

/** A fake hasher that only accepts the exact synthetic password. */
class FakeHasher implements PasswordHasher {
  readonly algorithm = 'scrypt';
  verifyCalls = 0;
  async hash(): Promise<never> {
    throw new Error('not used');
  }
  async verify(plain: string): Promise<boolean> {
    this.verifyCalls += 1;
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

class FakeIdentity implements IdentityRepository {
  constructor(private readonly users: Map<string, AuthCandidate>) {}
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

class FakeSessions implements SessionRepository {
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
  activeCount(): number {
    return [...this.rows.values()].filter((r) => r.revokedAt === null).length;
  }
}

function build(opts: { users?: AuthCandidate[]; ttlMs?: number } = {}) {
  const users = new Map<string, AuthCandidate>();
  for (const u of opts.users ?? [candidate()]) users.set(u.userId, u);
  const identity = new FakeIdentity(users);
  const sessions = new FakeSessions((userId) => users.get(userId)?.publicId ?? PUBLIC_ID);
  const hasher = new FakeHasher();
  const rateLimiter = new LoginRateLimiter({
    windowMs: 1000,
    maxAttempts: 100,
    maxKeys: 100,
    now: () => 0,
  });
  const service = new AuthService({
    identity,
    sessions,
    hasher,
    rateLimiter,
    sessionTtlMs: opts.ttlMs ?? 60_000,
    now: () => NOW,
  });
  return { service, identity, sessions, hasher, rateLimiter, users };
}

describe('AuthService.login — uniform failure', () => {
  interface FailureCase {
    readonly label: string;
    readonly users: AuthCandidate[];
    readonly login: unknown;
    readonly password: unknown;
  }

  const failureCases: FailureCase[] = [
    { label: 'unknown login', users: [], login: 'nobody', password: 'x' },
    {
      label: 'wrong password',
      users: [candidate()],
      login: 'teacher.one',
      password: 'wrong-password-0000',
    },
    {
      label: 'PENDING account',
      users: [candidate({ state: 'PENDING' })],
      login: 'teacher.one',
      password: PASSWORD,
    },
    {
      label: 'DISABLED account',
      users: [candidate({ state: 'DISABLED' })],
      login: 'teacher.one',
      password: PASSWORD,
    },
    {
      label: 'no credential',
      users: [candidate({ credential: null })],
      login: 'teacher.one',
      password: PASSWORD,
    },
  ];

  it.each(failureCases)(
    'rejects $label with a single uniform AuthenticationFailedError',
    async ({ users, login, password }) => {
      const { service } = build({ users });
      const error = await service.login({ login, password }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationFailedError);
      expect((error as AuthenticationFailedError).message).toBe('Invalid login or password.');
      expect((error as AuthenticationFailedError).code).toBe('AUTH_INVALID_CREDENTIALS');
    },
  );

  it('does not short-circuit the rate limiter for an empty login (still counted)', async () => {
    const { service } = build({ users: [] });
    await expect(service.login({ login: '', password: 'x' })).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it('rejects with LoginRateLimitedError once the key is exhausted', async () => {
    const { service, rateLimiter } = build({ users: [] });
    // Exhaust the limiter by exceeding maxAttempts on the same key.
    const key = loginRateLimitKey('teacher.one');
    for (let i = 0; i < 100; i += 1) rateLimiter.hit(key);
    await expect(
      service.login({ login: 'teacher.one', password: PASSWORD }),
    ).rejects.toBeInstanceOf(LoginRateLimitedError);
  });
});

describe('AuthService.login — success + rotation', () => {
  it('issues a fresh opaque session + csrf token and never returns the password', async () => {
    const { service, sessions } = build();
    const result = await service.login({ login: 'teacher.one', password: PASSWORD });
    expect(result.session.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.session.csrfToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.session.expiresAt.getTime()).toBe(NOW.getTime() + 60_000);
    expect(result.principal).toEqual({
      userId: 'user-1',
      publicId: PUBLIC_ID,
      login: 'teacher.one',
      roles: ['TEACHER'],
    });
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
    // The stored row carries hashes only — never the raw token.
    const row = [...sessions.rows.values()][0];
    expect(row.tokenHash).toBe(hashSessionToken(result.session.rawToken));
    expect(JSON.stringify(row)).not.toContain(result.session.rawToken);
  });

  it('ROTATES: revokes a pre-existing valid session before minting the new one', async () => {
    const { service, sessions } = build();
    const first = await service.login({ login: 'teacher.one', password: PASSWORD });
    const second = await service.login({
      login: 'teacher.one',
      password: PASSWORD,
      rotateExistingToken: first.session.rawToken,
    });
    expect(second.session.rawToken).not.toBe(first.session.rawToken);
    // Exactly one active session remains; the first is revoked.
    expect(sessions.activeCount()).toBe(1);
    const old = await service.resolveSession(first.session.rawToken);
    expect(old).toBeNull();
  });

  it('ignores a malformed rotate token (does not throw, still issues a session)', async () => {
    const { service } = build();
    const result = await service.login({
      login: 'teacher.one',
      password: PASSWORD,
      rotateExistingToken: 'not-a-valid-token',
    });
    expect(result.session.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('AuthService.resolveSession', () => {
  it('resolves an active session and advances lastUsedAt', async () => {
    const { service, sessions } = build();
    const { session } = await service.login({ login: 'teacher.one', password: PASSWORD });
    const resolved = await service.resolveSession(session.rawToken);
    expect(resolved?.principal.publicId).toBe(PUBLIC_ID);
    expect(resolved?.csrfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions.rows.get(resolved!.sessionId)!.lastUsedAt.getTime()).toBe(NOW.getTime());
  });

  it('returns null for missing / malformed / unknown tokens', async () => {
    const { service } = build();
    expect(await service.resolveSession(undefined)).toBeNull();
    expect(await service.resolveSession('short')).toBeNull();
    expect(await service.resolveSession(newSessionToken())).toBeNull();
  });

  it('returns null once the session is revoked', async () => {
    const { service } = build();
    const { session } = await service.login({ login: 'teacher.one', password: PASSWORD });
    await service.logout(session.rawToken);
    expect(await service.resolveSession(session.rawToken)).toBeNull();
  });

  it('returns null once the session is expired', async () => {
    const { service, sessions } = build({ ttlMs: 30_000 });
    const { session } = await service.login({ login: 'teacher.one', password: PASSWORD });
    // Force expiry.
    const row = [...sessions.rows.values()][0];
    sessions.rows.set(row.id, { ...row, expiresAt: new Date(NOW.getTime() - 1) });
    expect(await service.resolveSession(session.rawToken)).toBeNull();
  });

  it('returns null when the account is no longer ACTIVE (state re-applied server-side)', async () => {
    const { service, users } = build();
    const { session } = await service.login({ login: 'teacher.one', password: PASSWORD });
    users.set('user-1', candidate({ state: 'DISABLED' }));
    expect(await service.resolveSession(session.rawToken)).toBeNull();
  });
});

describe('AuthService.logout', () => {
  it('revokes the server-side session (idempotent, non-enumerating)', async () => {
    const { service, sessions } = build();
    const { session } = await service.login({ login: 'teacher.one', password: PASSWORD });
    await service.logout(session.rawToken);
    expect(sessions.activeCount()).toBe(0);
    // Second logout / unknown / malformed tokens are silent no-ops.
    await expect(service.logout(session.rawToken)).resolves.toBeUndefined();
    await expect(service.logout('nonsense')).resolves.toBeUndefined();
    await expect(service.logout(undefined)).resolves.toBeUndefined();
  });
});

describe('loginRateLimitKey', () => {
  it('keys on the NORMALIZED login only (never the password)', () => {
    expect(loginRateLimitKey('  Teacher.ONE ')).toBe('login:teacher.one');
    expect(loginRateLimitKey('')).toBe('login:__invalid__');
    expect(loginRateLimitKey(42)).toBe('login:__invalid__');
  });
});
