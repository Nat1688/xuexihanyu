/**
 * Authentication application service (CLP-00-06; ADR-003/ADR-004).
 *
 * Orchestrates the login / logout / session-resolution use-cases over the
 * identity and session ports plus the password-hashing port. It owns NO HTTP,
 * cookie or persistence detail; the controller maps its results to HTTP and the
 * infrastructure adapters implement the ports.
 *
 * Behavioural guarantees (task contract):
 *   - Login verifies through the {@link PasswordHasher} and NEVER logs/stores a
 *     raw password.
 *   - Login failure is UNIFORM: unknown login, wrong password, PENDING and
 *     DISABLED all raise {@link AuthenticationFailedError} (same external body).
 *   - Successful login ROTATES the session: any pre-existing session presented
 *     on the request is revoked before a fresh session is created (session-
 *     fixation defence), and a brand-new opaque token + CSRF token are issued.
 *   - Logout REVOKES the server-side session BEFORE the caller clears cookies.
 *   - Session resolution (`resolveSession`) enforces revocation + expiry and
 *     advances `lastUsedAt`.
 *   - A disabled account is rejected at login and its sessions are rejected on
 *     resolution (the account-state check is re-applied server-side).
 */
import {
  hashCsrfToken,
  hashSessionToken,
  isSessionValid,
  newCsrfToken,
  newSessionToken,
  type PublicUserId,
  type Role,
} from '../domain';

import {
  AuthenticationFailedError,
  LoginRateLimitedError,
  type LoginFailureReason,
} from './auth-errors';
import { credentialToPasswordHash, type IdentityRepository } from './identity-repository';
import { type LoginRateLimiter } from './login-rate-limiter';
import { type PasswordHasher } from './password-hasher';
import { type SessionRepository } from './session-repository';

import { normalizeLogin } from '../domain/login';
import { isSessionToken } from '../domain/session-token';

/** The authenticated principal resolved from a valid session. */
export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly publicId: PublicUserId;
  readonly login: string;
  readonly roles: readonly Role[];
}

/** A freshly-issued session: the raw tokens the caller must set as cookies. */
export interface IssuedSession {
  readonly rawToken: string;
  readonly csrfToken: string;
  readonly expiresAt: Date;
}

/** Outcome of a login attempt. */
export interface LoginResult {
  readonly principal: AuthenticatedPrincipal;
  readonly session: IssuedSession;
}

export interface AuthServiceDeps {
  readonly identity: IdentityRepository;
  readonly sessions: SessionRepository;
  readonly hasher: PasswordHasher;
  readonly rateLimiter: LoginRateLimiter;
  /** Session lifetime in milliseconds. */
  readonly sessionTtlMs: number;
  /** Current time injection (deterministic tests). Defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

/**
 * Build a stable, non-reversible rate-limit key from a login attempt. Uses the
 * NORMALIZED login only (never the raw password); a malformed login collapses
 * to a constant key so it cannot blow up the key space. `clientKey` (e.g. IP)
 * may be appended by the caller via `rateLimitKey`.
 */
export function loginRateLimitKey(rawLogin: unknown): string {
  if (typeof rawLogin !== 'string' || rawLogin.trim().length === 0) {
    return 'login:__invalid__';
  }
  let normalized: string;
  try {
    normalized = normalizeLogin(rawLogin);
  } catch {
    return 'login:__invalid__';
  }
  return `login:${normalized}`;
}

export class AuthService {
  private readonly now: () => Date;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Attempt authentication for a raw login + password.
   *
   * @throws AuthenticationFailedError  uniform failure (any reason).
   * @throws LoginRateLimitedError      when the bounded limiter blocks the key.
   *
   * `rotateExistingToken` is the raw session token, if any, presented on the
   * login request; when present and valid it is revoked first (rotation).
   */
  async login(input: {
    login: unknown;
    password: unknown;
    rotateExistingToken?: string;
    rateLimitKey?: string;
  }): Promise<LoginResult> {
    const { login, password, rotateExistingToken, rateLimitKey } = input;

    const key = rateLimitKey ?? loginRateLimitKey(login);
    const limit = this.deps.rateLimiter.hit(key);
    if (!limit.allowed) {
      throw new LoginRateLimitedError();
    }

    // Normalize the login; an invalid/missing login is a UNIFORM failure. We do
    // NOT short-circuit before the limiter (done above) so empty and non-empty
    // attempts are treated identically.
    let normalized: string;
    try {
      normalized = normalizeLogin(typeof login === 'string' ? login : '');
    } catch {
      throw new AuthenticationFailedError('unknown_login');
    }

    const candidate = await this.deps.identity.findAuthCandidateByNormalizedLogin(normalized);

    // Unknown login → uniform failure. Still run a dummy verify to keep timing
    // within the same order of magnitude as the wrong-password path (best
    // effort; the hasher never throws for input length, so use a fixed string).
    if (!candidate) {
      await this.dummyVerify(password);
      throw new AuthenticationFailedError('unknown_login');
    }

    // State gate: PENDING/DISABLED cannot authenticate, regardless of password.
    if (candidate.state !== 'ACTIVE') {
      const reason: LoginFailureReason =
        candidate.state === 'DISABLED' ? 'account_disabled' : 'account_pending';
      await this.dummyVerify(password);
      throw new AuthenticationFailedError(reason);
    }

    if (!candidate.credential) {
      await this.dummyVerify(password);
      throw new AuthenticationFailedError('no_credential');
    }

    const ok = await this.deps.hasher.verify(
      typeof password === 'string' ? password : '',
      credentialToPasswordHash(candidate.credential),
    );
    if (!ok) {
      throw new AuthenticationFailedError('wrong_password');
    }

    // Rotation/session-fixation defence: revoke any pre-existing session that
    // was presented on this request before minting the new one.
    if (typeof rotateExistingToken === 'string' && isSessionToken(rotateExistingToken)) {
      const existing = await this.deps.sessions.findByTokenHash(
        hashSessionToken(rotateExistingToken),
      );
      if (existing && existing.revokedAt === null) {
        await this.deps.sessions.revoke(existing.id, this.now());
      }
    }

    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.deps.sessionTtlMs);
    const rawToken = newSessionToken();
    const csrfToken = newCsrfToken();

    await this.deps.sessions.create({
      userId: candidate.userId,
      tokenHash: hashSessionToken(rawToken),
      csrfHash: hashCsrfToken(csrfToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    });

    const roles = candidate.roles.length
      ? [...candidate.roles]
      : await this.deps.identity.findRolesByUserId(candidate.userId);

    return {
      principal: {
        userId: candidate.userId,
        publicId: candidate.publicId,
        login: candidate.login,
        roles,
      },
      session: { rawToken, csrfToken, expiresAt },
    };
  }

  /**
   * Resolve the principal for a presented raw token, or `null` when the token
   * is missing/malformed/unknown/expired/revoked — or when the owning account
   * is no longer authenticatable. Advances `lastUsedAt` on success.
   *
   * Also returns the session's bound CSRF hash so a state-changing request can
   * verify its double-submit proof against the SAME session.
   */
  async resolveSession(rawToken: unknown): Promise<{
    principal: AuthenticatedPrincipal;
    csrfHash: string;
    sessionId: string;
  } | null> {
    if (!isSessionToken(rawToken)) return null;
    const session = await this.deps.sessions.findByTokenHash(hashSessionToken(rawToken));
    if (!session) return null;

    const now = this.now();
    if (!isSessionValid(session, now)) return null;

    const candidate = await this.deps.identity.findById(session.userId);
    if (!candidate || candidate.state !== 'ACTIVE') return null;

    await this.deps.sessions.touch(session.id, now);

    const roles = candidate.roles.length
      ? [...candidate.roles]
      : await this.deps.identity.findRolesByUserId(candidate.userId);

    return {
      principal: {
        userId: candidate.userId,
        publicId: candidate.publicId,
        login: candidate.login,
        roles,
      },
      csrfHash: session.csrfHash,
      sessionId: session.id,
    };
  }

  /**
   * Log out: revoke the server-side session for the presented token (if any).
   * MUST complete before the caller clears the browser cookies. Idempotent and
   * non-enumerating — an unknown/already-revoked token is a no-op success.
   */
  async logout(rawToken: unknown): Promise<void> {
    if (!isSessionToken(rawToken)) return;
    const session = await this.deps.sessions.findByTokenHash(hashSessionToken(rawToken));
    if (!session) return;
    if (session.revokedAt === null) {
      await this.deps.sessions.revoke(session.id, this.now());
    }
  }

  /**
   * Best-effort timing equalisation for the no-candidate / non-active-state
   * paths. Verification against a fixed, valid-format synthetic hash always
   * returns false but performs comparable work, so an attacker cannot easily
   * distinguish "no account"/"disabled" from "wrong password" by latency.
   * `verify` returns false for non-strings/empties by contract and never throws.
   */
  private async dummyVerify(password: unknown): Promise<void> {
    try {
      await this.deps.hasher.verify(typeof password === 'string' ? password : '', {
        algorithm: this.deps.hasher.algorithm,
        parameters: {},
        hash: 'scrypt$N=32768,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      });
    } catch {
      // Swallow: this path only exists to equalise timing.
    }
  }
}
