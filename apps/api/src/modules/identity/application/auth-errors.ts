/**
 * Authentication error vocabulary (CLP-00-06; ADR-003/ADR-005).
 *
 * Two hard requirements shape these types:
 *
 *   1. UNIFORM login failure. Unknown login, wrong password, `PENDING` and
 *      `DISABLED` must produce the SAME externally visible response — a single
 *      `401` with code `AUTH_INVALID_CREDENTIALS` and a fixed message — so the
 *      API is never an account-enumeration oracle. The specific internal reason
 *      is carried only for server-side logging (category only; never the raw
 *      password/token/state).
 *   2. CSRF failure. A missing/invalid CSRF proof is `403 AUTH_CSRF_INVALID`,
 *      distinct from authentication failure but revealing nothing about the
 *      session's existence.
 *
 * These errors are mapped by the HTTP layer to the ADR-005 error contract
 * (stable machine code + safe message + status). No stack trace, SQL, token,
 * cookie or account detail ever leaves the boundary.
 */

/** The single external code for any failed login. */
export const INVALID_CREDENTIALS_CODE = 'AUTH_INVALID_CREDENTIALS';

/** Fixed, enumeration-safe message for any failed login. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid login or password.';

/** External code for a missing/invalid CSRF proof on a state-changing request. */
export const CSRF_INVALID_CODE = 'AUTH_CSRF_INVALID';

/** Fixed, safe message for a rejected CSRF proof. */
export const CSRF_INVALID_MESSAGE = 'Request could not be verified.';

/** External code for a missing/expired/revoked session on a protected route. */
export const UNAUTHENTICATED_CODE = 'AUTH_REQUIRED';

/** Fixed, safe message for an unauthenticated protected request. */
export const UNAUTHENTICATED_MESSAGE = 'Authentication required.';

/**
 * Internal, server-only reason for a login failure. Used to categorise logs
 * (never exposed to the client). Kept deliberately coarse.
 */
export type LoginFailureReason =
  'unknown_login' | 'wrong_password' | 'account_pending' | 'account_disabled' | 'no_credential';

/**
 * Raised internally when authentication fails. The HTTP layer converts EVERY
 * instance to the same uniform 401 body regardless of `reason`.
 */
export class AuthenticationFailedError extends Error {
  readonly code = INVALID_CREDENTIALS_CODE;
  constructor(
    /** Server-side only: coarse category for logs. Never serialized. */
    readonly reason: LoginFailureReason,
  ) {
    // The message is the FIXED uniform one — `reason` is not interpolated.
    super(INVALID_CREDENTIALS_MESSAGE);
    this.name = 'AuthenticationFailedError';
  }
}

/** Raised when a login is refused by the rate limiter (uniform external body). */
export class LoginRateLimitedError extends Error {
  readonly code = 'AUTH_RATE_LIMITED';
  constructor() {
    super('Too many attempts. Please try again later.');
    this.name = 'LoginRateLimitedError';
  }
}

/** Raised when a state-changing request lacks a valid CSRF proof. */
export class CsrfInvalidError extends Error {
  readonly code = CSRF_INVALID_CODE;
  constructor() {
    super(CSRF_INVALID_MESSAGE);
    this.name = 'CsrfInvalidError';
  }
}

/** Raised when a protected route is accessed without a valid session. */
export class UnauthenticatedError extends Error {
  readonly code = UNAUTHENTICATED_CODE;
  constructor() {
    super(UNAUTHENTICATED_MESSAGE);
    this.name = 'UnauthenticatedError';
  }
}
