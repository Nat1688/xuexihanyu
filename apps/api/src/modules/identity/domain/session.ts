/**
 * Session domain model + validity rules (CLP-00-06; ADR-003).
 *
 * A session is a server-side record with an owner, an expiry instant and an
 * optional revocation instant. Its validity is a PURE function of those fields
 * and the current time — no HTTP, cookie or persistence detail leaks into the
 * domain, and the rules are independently testable.
 *
 * All instants are UTC `Date` values (ADR: "time is stored unambiguously").
 * A session is valid iff it is not revoked AND its expiry is strictly in the
 * future. A revoked session is invalid even if unexpired (logout must win).
 */
import { type PublicUserId } from './public-user-id';
import { type SessionTokenHash } from './session-token';

/** The minimal, persistence-agnostic view of a session. */
export interface SessionRecord {
  /** Internal surrogate id (never exposed to the browser). */
  readonly id: string;
  /** Owning user's public id (the only user identifier surfaced). */
  readonly userPublicId: PublicUserId;
  /** SHA-256 hash of the raw token (the persisted lookup key). */
  readonly tokenHash: SessionTokenHash;
  /** SHA-256 hash of the CSRF token bound to this session (double-submit). */
  readonly csrfHash: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
  /** Set when the session was explicitly revoked (logout/invalidation). */
  readonly revokedAt: Date | null;
}

/** True when the session has been explicitly revoked. */
export function isRevoked(session: Pick<SessionRecord, 'revokedAt'>): boolean {
  return session.revokedAt !== null;
}

/** True when the session has passed its expiry at `now`. */
export function isExpired(session: Pick<SessionRecord, 'expiresAt'>, now: Date): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}

/**
 * True when the session currently authenticates its owner: not revoked and not
 * expired. `now` is injected so the rule is deterministic in tests.
 */
export function isSessionValid(
  session: Pick<SessionRecord, 'revokedAt' | 'expiresAt'>,
  now: Date,
): boolean {
  return !isRevoked(session) && !isExpired(session, now);
}
