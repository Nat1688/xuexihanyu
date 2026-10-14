/**
 * Identity domain model (CLP-00-05; ADR-004).
 *
 * A small, persistence-agnostic view of a user: its public id, normalized
 * login, account state and approved roles. It carries NO credential material
 * (only a flag that a credential exists) and NO profile/class/enrollment data —
 * those are deliberately out of CP-00 scope.
 */
import { isAuthenticatable, type AccountState } from './account-state';
import { normalizeLogin } from './login';
import { type PublicUserId } from './public-user-id';
import { validateRoles, type Role } from './role';

/** The minimal identity shape the domain reasons about. */
export interface IdentityUser {
  readonly publicId: PublicUserId;
  /** Raw login as supplied (informational; uniqueness uses the normalized form). */
  readonly login: string;
  /** Canonical normalized login — the value constrained UNIQUE in the DB. */
  readonly loginNormalized: string;
  readonly state: AccountState;
  readonly roles: readonly Role[];
  /** Whether a password credential row exists for this user. */
  readonly hasCredential: boolean;
}

/**
 * Build an {@link IdentityUser}, normalizing the login and validating the role
 * set through the domain rules. Throws on invalid login or unknown role.
 */
export function makeIdentityUser(input: {
  publicId: PublicUserId;
  login: string;
  state: AccountState;
  roles: readonly unknown[];
  hasCredential: boolean;
}): IdentityUser {
  return Object.freeze({
    publicId: input.publicId,
    login: input.login,
    loginNormalized: normalizeLogin(input.login),
    state: input.state,
    roles: Object.freeze(validateRoles(input.roles)),
    hasCredential: input.hasCredential,
  });
}

/**
 * Domain-level "may this account authenticate?" decision. Disabled and pending
 * accounts are rejected here regardless of any HTTP/session layer. This is a
 * pure predicate — no session invalidation logic lives in CLP-00-05.
 */
export function canAuthenticate(user: IdentityUser): boolean {
  return isAuthenticatable(user.state) && user.hasCredential;
}
