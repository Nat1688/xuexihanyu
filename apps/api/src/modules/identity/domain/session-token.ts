/**
 * Opaque session token minting + hashing boundary (CLP-00-06; ADR-003).
 *
 * ADR-003 requires the browser to hold only an OPAQUE session identifier, with
 * no browser-accessible bearer token and no JWT. This module is the single
 * authority for minting that identifier and for deriving the value actually
 * persisted server-side.
 *
 * Two values, deliberately distinct:
 *
 *   - the RAW token — 32 cryptographically-random bytes, base64url-encoded.
 *     It is placed in the HttpOnly cookie and returned to the browser EXACTLY
 *     ONCE at login. It is never stored and never logged.
 *   - the TOKEN HASH — SHA-256 of the raw token, hex-encoded (`token_hash`,
 *     VARCHAR(128), UNIQUE). Only this is persisted, so reading the database
 *     cannot reconstruct a usable cookie. SHA-256 is appropriate here (unlike
 *     for passwords) because the token is already high-entropy random: there is
 *     nothing to brute-force and no need for a memory-hard KDF.
 *
 * Lookup is constant-work over a UNIQUE index: hash the presented cookie token
 * and match `token_hash`. No secret pepper is required (the token has full
 * entropy on its own), which keeps the boundary dependency-free and auditable.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Raw token size in bytes. 32 bytes = 256 bits of entropy. */
export const SESSION_TOKEN_BYTES = 32;

/** Maximum stored token-hash length, aligned with the DB column (VARCHAR(128)). */
export const SESSION_TOKEN_HASH_MAX_LENGTH = 128;

/** A raw, opaque session token (present in the cookie; never persisted). */
export type SessionToken = string;

/** A hex-encoded SHA-256 token hash (the only value persisted). */
export type SessionTokenHash = string;

/**
 * Raised when an input cannot be a valid raw session token. Carries no value
 * from the offending input (a malformed token must never be echoed).
 */
export class InvalidSessionTokenError extends Error {
  readonly code = 'SESSION_INVALID_TOKEN';
  constructor(reason: string) {
    super(`Invalid session token: ${reason}`);
    this.name = 'InvalidSessionTokenError';
  }
}

/** Mint a fresh, cryptographically-random opaque session token. */
export function newSessionToken(): SessionToken {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * Derive the persisted token hash from a raw token. Deterministic and
 * one-way; the raw token never leaves this function's argument.
 */
export function hashSessionToken(token: SessionToken): SessionTokenHash {
  if (typeof token !== 'string' || token.length === 0) {
    throw new InvalidSessionTokenError('empty');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * True when a candidate is a plausible raw token: a non-empty base64url string
 * of exactly the expected length for {@link SESSION_TOKEN_BYTES}. Used to
 * reject obviously-malformed cookies before any database work, without
 * revealing whether a well-formed token exists.
 */
export function isSessionToken(value: unknown): value is SessionToken {
  if (typeof value !== 'string') return false;
  // base64url of 32 bytes is 43 chars, no padding.
  const expectedLength = Math.ceil((SESSION_TOKEN_BYTES * 4) / 3);
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length === expectedLength;
}

/**
 * Constant-time comparison of two raw token strings, for the rare case a
 * comparison must be made in memory (e.g. tests). Length differences are
 * folded into a false result without early return.
 */
export function sessionTokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
