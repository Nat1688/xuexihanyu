/**
 * Session persistence port (CLP-00-06; ADR-003).
 *
 * The application layer depends on THIS interface, not on Prisma, so the
 * session store can be swapped and tests can inject a deterministic in-memory
 * fake. The port deals only in the domain {@link SessionRecord} shape and the
 * lookup key (the token hash); it never sees a raw token.
 *
 * Security-relevant contract:
 *   - `findByTokenHash` returns the session for a token HASH (the caller hashes
 *     the presented cookie token; the raw token never reaches the store).
 *   - `create` persists a new session (token hash + csrf hash only).
 *   - `touch` advances `lastUsedAt` (bounded, best-effort observability).
 *   - `revoke` marks a session revoked (logout); it MUST be effective before
 *     the cookie is cleared, so callers await it.
 *   - `revokeAllForUser` invalidates every session of a user (used on account
 *     lifecycle events per ADR-003; exposed for completeness/tests).
 */
import { type SessionRecord, type SessionTokenHash } from '../domain';

/** Fields required to create a persisted session. */
export interface CreateSessionInput {
  readonly userId: string;
  readonly tokenHash: SessionTokenHash;
  readonly csrfHash: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
}

/** A session as returned by the store, including the internal user surrogate id. */
export interface PersistedSession extends SessionRecord {
  /** Owning user's internal surrogate id (persistence-side; not surfaced). */
  readonly userId: string;
}

export interface SessionRepository {
  /** Look up a session by the hash of its raw token. `null` when absent. */
  findByTokenHash(tokenHash: SessionTokenHash): Promise<PersistedSession | null>;

  /** Persist a new session and return it. */
  create(input: CreateSessionInput): Promise<PersistedSession>;

  /** Advance `lastUsedAt` to `at`; returns the updated session. */
  touch(sessionId: string, at: Date): Promise<PersistedSession>;

  /** Mark a session revoked at `at`. Idempotent; resolves once persisted. */
  revoke(sessionId: string, at: Date): Promise<void>;

  /** Revoke every active session of a user at `at`. Returns the count revoked. */
  revokeAllForUser(userId: string, at: Date): Promise<number>;
}
