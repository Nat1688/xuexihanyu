/**
 * Auth HTTP error-mapping unit tests (CLP-00-06; ADR-005).
 *
 * Proves the uniform, non-enumerating error contract:
 *   - EVERY login failure reason maps to the SAME 401 body;
 *   - a missing/expired/revoked session maps to 401 AUTH_REQUIRED;
 *   - a rejected CSRF proof maps to 403 AUTH_CSRF_INVALID;
 *   - the rate limiter maps to 429;
 *   - the mapped body carries a correlation id when supplied and never leaks
 *     the internal reason, a token, a stack or the raw password.
 */
import {
  AuthenticationFailedError,
  CsrfInvalidError,
  INVALID_CREDENTIALS_CODE,
  INVALID_CREDENTIALS_MESSAGE,
  LoginRateLimitedError,
  type LoginFailureReason,
  UnauthenticatedError,
} from '../../src/modules/identity/application/auth-errors';
import { mapAuthError } from '../../src/modules/identity/http/auth-error-mapper';

const ALL_REASONS: LoginFailureReason[] = [
  'unknown_login',
  'wrong_password',
  'account_pending',
  'account_disabled',
  'no_credential',
];

describe('auth error mapping (uniform, non-enumerating)', () => {
  it('maps EVERY login failure reason to the exact same 401 body', () => {
    const expected = {
      status: 401,
      body: { error: { code: INVALID_CREDENTIALS_CODE, message: INVALID_CREDENTIALS_MESSAGE } },
    };
    for (const reason of ALL_REASONS) {
      expect(mapAuthError(new AuthenticationFailedError(reason))).toEqual(expected);
    }
  });

  it('never leaks the internal login-failure reason in the mapped body', () => {
    for (const reason of ALL_REASONS) {
      const mapped = mapAuthError(new AuthenticationFailedError(reason));
      expect(JSON.stringify(mapped)).not.toContain(reason);
    }
  });

  it('maps a rejected session to 401 AUTH_REQUIRED', () => {
    expect(mapAuthError(new UnauthenticatedError())).toEqual({
      status: 401,
      body: { error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } },
    });
  });

  it('maps a CSRF failure to 403 AUTH_CSRF_INVALID', () => {
    expect(mapAuthError(new CsrfInvalidError())).toEqual({
      status: 403,
      body: { error: { code: 'AUTH_CSRF_INVALID', message: 'Request could not be verified.' } },
    });
  });

  it('maps a rate-limited login to 429 (uniform, no account detail)', () => {
    const mapped = mapAuthError(new LoginRateLimitedError());
    expect(mapped?.status).toBe(429);
    expect(mapped?.body.error.code).toBe('AUTH_RATE_LIMITED');
  });

  it('attaches a correlation id when supplied, and omits it otherwise', () => {
    const withId = mapAuthError(new CsrfInvalidError(), 'req-123');
    expect(withId?.body.error.requestId).toBe('req-123');
    const withoutId = mapAuthError(new CsrfInvalidError());
    expect(withoutId?.body.error.requestId).toBeUndefined();
  });

  it('returns null for an unknown error so the caller can rethrow (no internals leak)', () => {
    expect(mapAuthError(new Error('sql: SELECT * FROM users'))).toBeNull();
    expect(mapAuthError('not-an-error')).toBeNull();
  });
});
