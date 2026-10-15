/**
 * Auth HTTP error mapping (CLP-00-06; ADR-005).
 *
 * Maps the application's auth errors to the ADR-005 error contract: a stable
 * machine code, a safe user-facing message, an HTTP status and a correlation id.
 * It NEVER exposes stack traces, SQL/ORM errors, tokens, cookies or which
 * specific credential/state check failed.
 *
 * Kept as a small pure function (not a global filter) so the auth controller
 * can translate deliberately and tests can assert the exact body. Other
 * unexpected errors bubble to Nest's default handling (generic 500), which
 * already omits internals.
 */
import {
  AuthenticationFailedError,
  CsrfInvalidError,
  ForbiddenError,
  INVALID_CREDENTIALS_CODE,
  INVALID_CREDENTIALS_MESSAGE,
  LoginRateLimitedError,
  UnauthenticatedError,
} from '../application/auth-errors';

/** The stable error body shape (ADR-005). */
export interface AuthErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId?: string;
  };
}

/** An auth error translated to (status, body). */
export interface MappedAuthError {
  readonly status: number;
  readonly body: AuthErrorBody;
}

/**
 * Translate a known auth error to its HTTP shape, or `null` when the error is
 * not one this layer owns (so the caller can rethrow).
 *
 * Uniformity: EVERY {@link AuthenticationFailedError} (unknown login, wrong
 * password, pending, disabled, no credential) maps to the SAME 401 body.
 */
export function mapAuthError(error: unknown, requestId?: string): MappedAuthError | null {
  if (error instanceof AuthenticationFailedError) {
    return {
      status: 401,
      body: { error: withId(INVALID_CREDENTIALS_CODE, INVALID_CREDENTIALS_MESSAGE, requestId) },
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      body: { error: withId(error.code, error.message, requestId) },
    };
  }
  if (error instanceof CsrfInvalidError) {
    return {
      status: 403,
      body: { error: withId(error.code, error.message, requestId) },
    };
  }
  if (error instanceof ForbiddenError) {
    return {
      status: 403,
      body: { error: withId(error.code, error.message, requestId) },
    };
  }
  if (error instanceof LoginRateLimitedError) {
    return {
      status: 429,
      body: { error: withId(error.code, error.message, requestId) },
    };
  }
  return null;
}

function withId(code: string, message: string, requestId?: string): AuthErrorBody['error'] {
  return requestId ? { code, message, requestId } : { code, message };
}
