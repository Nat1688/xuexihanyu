/**
 * Password hashing port (CLP-00-05; ADR-004).
 *
 * This is the APPLICATION boundary between the identity use-cases and any
 * concrete memory-hard hashing library. The domain depends only on this
 * interface, so the algorithm can be swapped/upgraded without touching
 * domain logic, and tests can inject a deterministic fake.
 *
 * Contract:
 *   - `hash(plain)` returns a persistable {@link PasswordHash}. The plaintext is
 *     never part of the returned value.
 *   - `verify(plain, stored)` returns a boolean and MUST NOT throw for a
 *     mismatch (only for genuinely malformed input).
 *   - `algorithm` names the algorithm so callers can store/compare it.
 *
 * The plaintext argument is an ephemeral `string`; implementations must not
 * retain, log or persist it.
 */
import type { PasswordHash } from '../domain/password-hash';

export interface PasswordHasher {
  /** Algorithm identifier persisted alongside each hash (e.g. `scrypt`). */
  readonly algorithm: string;

  /** Derive a memory-hard hash from a plaintext password. */
  hash(plain: string): Promise<PasswordHash>;

  /**
   * Constant-time verification of a plaintext password against a stored hash.
   * Returns `false` for any mismatch; never throws for a wrong password.
   */
  verify(plain: string, stored: PasswordHash): Promise<boolean>;
}
