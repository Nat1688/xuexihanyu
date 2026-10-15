/**
 * Identity read port for authentication (CLP-00-06; ADR-004/ADR-003).
 *
 * The login use-case needs, for a normalized login: the user's public id,
 * account state, credential (algorithm + parameters + hash) and role set. This
 * port exposes exactly that and nothing else — no profile, class or domain
 * data, and no write surface beyond what authentication requires.
 *
 * The port returns credential material as a {@link StoredCredential} carrying
 * the persistable {@link PasswordHash}; the raw password is never involved
 * here. Callers verify through the {@link PasswordHasher} port.
 */
import { type AccountState, type PasswordHash, type PublicUserId, type Role } from '../domain';

/** The credential material needed to verify a password (hash + metadata). */
export interface StoredCredential {
  readonly algorithm: string;
  readonly parameters: Record<string, number>;
  readonly hash: string;
}

/** The identity data authentication needs for one account. */
export interface AuthCandidate {
  /** Internal surrogate user id (used to bind sessions; not surfaced). */
  readonly userId: string;
  readonly publicId: PublicUserId;
  readonly login: string;
  readonly loginNormalized: string;
  readonly state: AccountState;
  readonly roles: readonly Role[];
  /** The stored credential, or `null` when the account has none. */
  readonly credential: StoredCredential | null;
}

export interface IdentityRepository {
  /**
   * Look up an authentication candidate by NORMALIZED login. Returns `null`
   * when no account matches; the caller must not distinguish "no account" from
   * "wrong password" in its external response.
   */
  findAuthCandidateByNormalizedLogin(loginNormalized: string): Promise<AuthCandidate | null>;

  /**
   * Read the roles currently assigned to a user (server-side authority for any
   * future role checks — never read from a session snapshot). CLP-00-06 does
   * not implement role guards; this exists so `/auth/me` can report the roles
   * of the authenticated user without inventing a session permission copy.
   */
  findRolesByUserId(userId: string): Promise<Role[]>;

  /**
   * Read a user's public identity + state by internal id. Returns `null` when
   * the user no longer exists (e.g. rows were removed between login and a
   * subsequent request). Used by `/auth/me` and the auth guard.
   */
  findById(userId: string): Promise<AuthCandidate | null>;
}

/** Convenience: build a {@link PasswordHash} from a stored credential. */
export function credentialToPasswordHash(credential: StoredCredential): PasswordHash {
  return Object.freeze({
    algorithm: credential.algorithm,
    parameters: Object.freeze({ ...credential.parameters }),
    hash: credential.hash,
  });
}
