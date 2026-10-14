/**
 * Login-identifier normalization (CLP-00-05; ADR-004).
 *
 * The login identifier has a raw form (as the user typed it) and a normalized
 * form used for the UNIQUE database constraint. Normalization is deliberately
 * conservative and deterministic so "same identifier" collapses to one value:
 *
 *   1. Unicode NFC — canonical composition (é as one code point).
 *   2. Trim leading/trailing whitespace.
 *   3. Lower-case using a locale-independent mapping.
 *
 * We intentionally do NOT strip interior spaces or punctuation: uniqueness is
 * about identity, not fuzzy matching. An empty/whitespace-only login is
 * rejected — it can never be a valid identifier.
 */

/** Maximum accepted login length, aligned with the DB column (VARCHAR(320)). */
export const LOGIN_MAX_LENGTH = 320;

/** Raised when a login identifier is empty or otherwise unusable. */
export class InvalidLoginError extends Error {
  readonly code = 'IDENTITY_INVALID_LOGIN';
  constructor(reason: string) {
    super(`Invalid login identifier: ${reason}`);
    this.name = 'InvalidLoginError';
  }
}

/**
 * Normalize a raw login identifier into the canonical value stored UNIQUE in
 * the database. Throws {@link InvalidLoginError} when the result is empty or
 * exceeds {@link LOGIN_MAX_LENGTH}.
 */
export function normalizeLogin(rawLogin: string): string {
  if (typeof rawLogin !== 'string') {
    throw new InvalidLoginError('not a string');
  }
  const normalized = rawLogin.normalize('NFC').trim().toLowerCase();
  if (normalized.length === 0) {
    throw new InvalidLoginError('empty');
  }
  if (normalized.length > LOGIN_MAX_LENGTH) {
    throw new InvalidLoginError('too long');
  }
  return normalized;
}

/**
 * Two raw login identifiers are the same identity iff their normalized forms
 * are equal. This is the domain expression of the DB uniqueness constraint.
 */
export function sameLogin(a: string, b: string): boolean {
  return normalizeLogin(a) === normalizeLogin(b);
}
