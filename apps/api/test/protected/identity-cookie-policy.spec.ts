/**
 * Cookie policy unit tests (CLP-00-06; ADR-003).
 *
 * Pins the exact cookie attributes the contract requires: the session cookie is
 * HttpOnly, the CSRF cookie is NOT (the SPA must echo it), both are Secure
 * outside documented local development, host-only (`Path=/`, no Domain),
 * `SameSite=Lax`, and carry an explicit Max-Age matching the session TTL.
 *
 * Cookies are asserted BYTE-FOR-BYTE on the serialized header, because the
 * contract says the exact attribute string is not to be delegated to a helper.
 */
import {
  COOKIE_PATH,
  COOKIE_SAME_SITE,
  csrfCookiePolicy,
  CSRF_COOKIE_NAME,
  serializeClearedCookie,
  serializeCookie,
  sessionCookiePolicy,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
} from '../../src/modules/identity/application/cookie-policy';

describe('cookie policy attributes', () => {
  it('names the two cookies exactly', () => {
    expect(SESSION_COOKIE_NAME).toBe('clp_session');
    expect(CSRF_COOKIE_NAME).toBe('clp_csrf');
  });

  it('sets HttpOnly on the session cookie and NOT on the CSRF cookie', () => {
    expect(sessionCookiePolicy('production', 60).httpOnly).toBe(true);
    expect(csrfCookiePolicy('production', 60).httpOnly).toBe(false);
  });

  it('is host-only: Path=/ and never a Domain attribute', () => {
    const session = sessionCookiePolicy('production', 60);
    const csrf = csrfCookiePolicy('production', 60);
    expect(session.path).toBe(COOKIE_PATH);
    expect(csrf.path).toBe(COOKIE_PATH);
    const serialized = serializeCookie(session, 'x') + ';' + serializeCookie(csrf, 'x');
    expect(serialized).not.toMatch(/Domain=/i);
  });

  it('uses SameSite=Lax for both cookies', () => {
    expect(sessionCookiePolicy('production', 60).sameSite).toBe(COOKIE_SAME_SITE);
    expect(COOKIE_SAME_SITE).toBe('Lax');
    expect(csrfCookiePolicy('development', 60).sameSite).toBe('Lax');
  });

  it('derives Max-Age (seconds) from the session TTL in minutes', () => {
    expect(sessionCookiePolicy('production', 60).maxAgeSeconds).toBe(3600);
    expect(sessionCookiePolicy('production', 0).maxAgeSeconds).toBe(0);
  });
});

describe('secure-cookie policy by environment', () => {
  it('requires Secure everywhere except documented local development', () => {
    expect(shouldUseSecureCookies('development')).toBe(false);
    expect(shouldUseSecureCookies('test')).toBe(true);
    expect(shouldUseSecureCookies('production')).toBe(true);
  });

  it('treats test like production so a Prod regression is caught by test runs', () => {
    expect(sessionCookiePolicy('test', 60).secure).toBe(true);
    expect(sessionCookiePolicy('production', 60).secure).toBe(true);
    expect(sessionCookiePolicy('development', 60).secure).toBe(false);
  });
});

describe('Set-Cookie serialization (byte-for-byte)', () => {
  it('serializes the production session cookie with the exact attributes', () => {
    const policy = sessionCookiePolicy('production', 60);
    expect(serializeCookie(policy, 'RAWTOKEN')).toBe(
      'clp_session=RAWTOKEN; Path=/; Max-Age=3600; SameSite=Lax; HttpOnly; Secure',
    );
  });

  it('serializes the production CSRF cookie without HttpOnly', () => {
    const policy = csrfCookiePolicy('production', 60);
    expect(serializeCookie(policy, 'CSRFTOK')).toBe(
      'clp_csrf=CSRFTOK; Path=/; Max-Age=3600; SameSite=Lax; Secure',
    );
  });

  it('omits Secure in local development (and never adds Domain)', () => {
    const policy = sessionCookiePolicy('development', 30);
    const out = serializeCookie(policy, 'tok');
    expect(out).toBe('clp_session=tok; Path=/; Max-Age=1800; SameSite=Lax; HttpOnly');
    expect(out).not.toMatch(/Secure/);
    expect(out).not.toMatch(/Domain=/);
  });

  it('clears a cookie with an empty value and Max-Age=0 (same path/flags)', () => {
    const policy = sessionCookiePolicy('production', 60);
    expect(serializeClearedCookie(policy)).toBe(
      'clp_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure',
    );
  });

  it('URI-encodes the cookie value', () => {
    const policy = sessionCookiePolicy('production', 60);
    expect(serializeCookie(policy, 'a b/c')).toContain('clp_session=a%20b%2Fc');
  });
});
