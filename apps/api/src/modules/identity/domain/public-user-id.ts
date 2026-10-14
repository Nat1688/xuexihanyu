/**
 * Public identity identifier (CLP-00-05; ADR-004).
 *
 * Every user has a stable, non-guessable external identifier — a random UUID
 * (RFC 4122 v4). The internal surrogate `id` must never leave persistence; only
 * this public UUID is surfaced to callers. The type is opaque (a branded
 * string) so a raw string cannot silently stand in for a public id, and the
 * only way to mint one is {@link newPublicUserId}.
 */
import { randomUUID } from 'node:crypto';

/** An opaque, non-guessable external user identifier (UUID v4 string). */
export type PublicUserId = string & { readonly __brand: 'PublicUserId' };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mint a fresh, cryptographically-random public user identifier. */
export function newPublicUserId(): PublicUserId {
  return randomUUID() as PublicUserId;
}

/**
 * Validate a candidate string as a canonical UUID v4 public id. Rejects
 * anything that is not a v4 UUID so a guessable/enumerable value cannot be
 * treated as a public identity.
 */
export function isPublicUserId(value: unknown): value is PublicUserId {
  return typeof value === 'string' && UUID_V4.test(value);
}

/** Parse and validate an existing value into a {@link PublicUserId}. */
export function parsePublicUserId(value: string): PublicUserId {
  if (!isPublicUserId(value)) {
    throw new InvalidPublicUserIdError();
  }
  return value;
}

/** Raised when a value is not a valid v4 public user id. */
export class InvalidPublicUserIdError extends Error {
  readonly code = 'IDENTITY_INVALID_PUBLIC_ID';
  constructor() {
    super('Invalid public user id');
    this.name = 'InvalidPublicUserIdError';
  }
}
