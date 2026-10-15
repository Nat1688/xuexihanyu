/**
 * CSRF double-submit token boundary (CLP-00-06; ADR-003).
 *
 * ADR-003 requires state-changing cookie-authenticated requests to carry CSRF
 * protection, chosen for CP-00 as a **double-submit** mechanism:
 *
 *   1. On login the server mints a random CSRF token and sets it in a
 *      NON-HttpOnly `clp_csrf` cookie AND binds a HASH of it to the session
 *      record (so the token is verified server-side against the active
 *      session, not merely echoed — this defeats the classic "attacker sets
 *      the cookie" double-submit weakness).
 *   2. A state-changing request (e.g. logout) must send the token in the
 *      `X-CSRF-Token` header. The server requires BOTH that the header equals
 *      the cookie value AND that its hash matches the session's bound value.
 *
 * SAFE methods (GET/HEAD/OPTIONS) never change state and are exempt. Origin /
 * Referer checks are defence in depth (handled at the CORS/HTTP layer), not the
 * sole CSRF control. Login is exempt from session-bound CSRF (there is no
 * session yet) but ROTATES the session, which is the session-fixation defence.
 *
 * The token is high-entropy random; a SHA-256 hash binds it to the session.
 * The raw token is never persisted or logged.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** CSRF token size in bytes (192 bits — ample for an unguessable token). */
export const CSRF_TOKEN_BYTES = 24;

/** Header the SPA must echo the CSRF token in. */
export const CSRF_HEADER = 'x-csrf-token';

/** Maximum stored CSRF-hash length (matches the session column bound). */
export const CSRF_TOKEN_HASH_MAX_LENGTH = 128;

/** A raw CSRF token (present in the cookie + header; never persisted raw). */
export type CsrfToken = string;

/** A hex-encoded SHA-256 hash of a CSRF token (bound to the session). */
export type CsrfTokenHash = string;

/** Mint a fresh, cryptographically-random CSRF token. */
export function newCsrfToken(): CsrfToken {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
}

/** Derive the persisted/bound CSRF hash. One-way; never returns the raw token. */
export function hashCsrfToken(token: CsrfToken): CsrfTokenHash {
  if (typeof token !== 'string' || token.length === 0) {
    return '';
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * True when a candidate looks like a raw CSRF token (non-empty base64url of the
 * expected length). Used to reject obviously-malformed input early.
 */
export function isCsrfToken(value: unknown): value is CsrfToken {
  if (typeof value !== 'string') return false;
  const expectedLength = Math.ceil((CSRF_TOKEN_BYTES * 4) / 3);
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length === expectedLength;
}

/** Constant-time string comparison, folding length differences to `false`. */
function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a double-submit CSRF proof:
 *   - `cookieToken`  — the value read from the `clp_csrf` cookie;
 *   - `headerToken`  — the value read from the `X-CSRF-Token` header;
 *   - `sessionHash`  — the hash bound to the active session at login.
 *
 * The proof is valid iff all three are present and mutually consistent:
 * `hash(headerToken) == sessionHash` AND `headerToken == cookieToken`. Any
 * missing/inconsistent input returns `false` (never throws, never reveals
 * which part failed).
 */
export function verifyCsrfProof(input: {
  cookieToken: string | undefined;
  headerToken: string | undefined;
  sessionHash: string | null | undefined;
}): boolean {
  const { cookieToken, headerToken, sessionHash } = input;
  if (!cookieToken || !headerToken || !sessionHash) return false;
  if (!isCsrfToken(headerToken) || !isCsrfToken(cookieToken)) return false;
  if (!constantTimeStringEqual(headerToken, cookieToken)) return false;
  return constantTimeStringEqual(hashCsrfToken(headerToken), sessionHash);
}
