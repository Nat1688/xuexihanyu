/**
 * Password hash value type (CLP-00-05; ADR-004).
 *
 * The persistence boundary stores ONLY a memory-hard hash plus the algorithm
 * metadata required to verify it. This module models exactly that: an
 * algorithm id, its (non-secret) parameters, and the encoded hash. There is
 * deliberately NO plaintext password field anywhere in this file — a
 * {@link PasswordHash} can be persisted and logged safely.
 *
 * A plain password is an ephemeral `string` that lives only for the duration of
 * a `hash`/`verify` call and is never stored in this structure.
 */

/** Maximum stored hash length, aligned with the DB column (VARCHAR(512)). */
export const PASSWORD_HASH_MAX_LENGTH = 512;

/** Maximum stored algorithm length, aligned with the DB column (VARCHAR(64)). */
export const PASSWORD_ALGORITHM_MAX_LENGTH = 64;

/**
 * Algorithm parameters needed to reproduce a verification. Integer parameters
 * only, so the shape is stable and JSON-serializable into the DB `parameters`
 * column.
 */
export type PasswordHashParameters = Readonly<Record<string, number>>;

/** An immutable, persistable password hash (never contains plaintext). */
export interface PasswordHash {
  /** Algorithm identifier, e.g. `scrypt`. */
  readonly algorithm: string;
  /** Non-secret parameters (cost factors, key length, …). */
  readonly parameters: PasswordHashParameters;
  /** Encoded hash (hex/base64). Not reversible to the plain password. */
  readonly hash: string;
}

/**
 * Build and validate a {@link PasswordHash}. Rejects empty algorithm/hash and
 * over-length values so a value that could not be persisted is never
 * constructed. Non-integer parameters are rejected.
 */
export function makePasswordHash(input: {
  algorithm: string;
  parameters: PasswordHashParameters;
  hash: string;
}): PasswordHash {
  const { algorithm, parameters, hash } = input;
  if (!algorithm || algorithm.length > PASSWORD_ALGORITHM_MAX_LENGTH) {
    throw new InvalidPasswordHashError('invalid algorithm');
  }
  if (!hash || hash.length > PASSWORD_HASH_MAX_LENGTH) {
    throw new InvalidPasswordHashError('invalid or over-length hash');
  }
  for (const [key, value] of Object.entries(parameters)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidPasswordHashError(`non-integer parameter: ${key}`);
    }
  }
  return Object.freeze({
    algorithm,
    parameters: Object.freeze({ ...parameters }),
    hash,
  });
}

/** Raised when a password hash value is malformed. */
export class InvalidPasswordHashError extends Error {
  readonly code = 'IDENTITY_INVALID_PASSWORD_HASH';
  constructor(reason: string) {
    super(`Invalid password hash: ${reason}`);
    this.name = 'InvalidPasswordHashError';
  }
}
