/**
 * Session domain unit tests (CLP-00-06; ADR-003).
 *
 * Pure, non-database tests over the session lifecycle vocabulary: opaque
 * session-token minting/hashing, session validity (revocation wins over a
 * still-future expiry), and the double-submit CSRF proof. Synthetic values
 * only; no real tokens, cookies or user data.
 *
 * These are the invariants the HTTP layer and persistence rely on, so they are
 * asserted directly at the domain boundary rather than inferred from an e2e
 * path.
 */
import {
  CSRF_HEADER,
  CSRF_TOKEN_BYTES,
  hashCsrfToken,
  hashSessionToken,
  isCsrfToken,
  isExpired,
  isRevoked,
  isSessionToken,
  isSessionValid,
  newCsrfToken,
  newSessionToken,
  sessionTokensEqual,
  SESSION_TOKEN_BYTES,
  verifyCsrfProof,
} from '../../src/modules/identity/domain';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const FUTURE = new Date(NOW.getTime() + 60_000);
const PAST = new Date(NOW.getTime() - 60_000);

describe('session token (opaque, hashed for persistence)', () => {
  it('mints an opaque base64url token of the expected entropy width', () => {
    const token = newSessionToken();
    expect(isSessionToken(token)).toBe(true);
    // 32 random bytes → 43 base64url chars (no padding).
    expect(token.length).toBe(Math.ceil((SESSION_TOKEN_BYTES * 4) / 3));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('mints distinct tokens (no collision / no counter)', () => {
    expect(newSessionToken()).not.toBe(newSessionToken());
  });

  it('derives a deterministic, one-way hex SHA-256 hash as the persisted key', () => {
    const token = newSessionToken();
    const h1 = hashSessionToken(token);
    const h2 = hashSessionToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(token);
  });

  it('rejects an empty token before any hashing', () => {
    expect(() => hashSessionToken('')).toThrow();
  });

  it('rejects malformed candidates (wrong length / non-base64url)', () => {
    expect(isSessionToken('short')).toBe(false);
    expect(isSessionToken('')).toBe(false);
    expect(isSessionToken(undefined)).toBe(false);
    expect(isSessionToken('!'.repeat(43))).toBe(false);
  });

  it('compares tokens in constant time with length folded to false', () => {
    const token = newSessionToken();
    expect(sessionTokensEqual(token, token)).toBe(true);
    expect(sessionTokensEqual(token, newSessionToken())).toBe(false);
    expect(sessionTokensEqual(token, 'short')).toBe(false);
  });
});

describe('csrf token (double-submit, session-bound)', () => {
  it('mints a base64url token of the expected width', () => {
    const token = newCsrfToken();
    expect(isCsrfToken(token)).toBe(true);
    expect(token.length).toBe(Math.ceil((CSRF_TOKEN_BYTES * 4) / 3));
  });

  it('binds a token to the session via a one-way hash', () => {
    const token = newCsrfToken();
    expect(hashCsrfToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCsrfToken(token)).toBe(hashCsrfToken(token));
    expect(hashCsrfToken(token)).not.toContain(token);
  });

  it('uses the x-csrf-token header name', () => {
    expect(CSRF_HEADER).toBe('x-csrf-token');
  });

  it('accepts a proof only when header == cookie AND hash(header) == sessionHash', () => {
    const token = newCsrfToken();
    const sessionHash = hashCsrfToken(token);
    expect(verifyCsrfProof({ cookieToken: token, headerToken: token, sessionHash })).toBe(true);
  });

  it('rejects when the header does not match the cookie (classic double-submit attack)', () => {
    const cookie = newCsrfToken();
    const attackerHeader = newCsrfToken();
    // Bind the cookie value's hash, but the attacker sends their own header.
    const sessionHash = hashCsrfToken(cookie);
    expect(verifyCsrfProof({ cookieToken: cookie, headerToken: attackerHeader, sessionHash })).toBe(
      false,
    );
  });

  it('rejects when hash(header) does not match the session-bound hash', () => {
    const token = newCsrfToken();
    expect(
      verifyCsrfProof({
        cookieToken: token,
        headerToken: token,
        sessionHash: hashCsrfToken(newCsrfToken()),
      }),
    ).toBe(false);
  });

  it('rejects any missing part (fail closed, never throws)', () => {
    const token = newCsrfToken();
    const sessionHash = hashCsrfToken(token);
    expect(verifyCsrfProof({ cookieToken: undefined, headerToken: token, sessionHash })).toBe(
      false,
    );
    expect(verifyCsrfProof({ cookieToken: token, headerToken: undefined, sessionHash })).toBe(
      false,
    );
    expect(verifyCsrfProof({ cookieToken: token, headerToken: token, sessionHash: null })).toBe(
      false,
    );
    expect(verifyCsrfProof({ cookieToken: '', headerToken: '', sessionHash: '' })).toBe(false);
  });

  it('rejects malformed tokens even if both sides match', () => {
    const bogus = 'not-a-valid-token';
    expect(
      verifyCsrfProof({
        cookieToken: bogus,
        headerToken: bogus,
        sessionHash: hashCsrfToken(bogus),
      }),
    ).toBe(false);
  });
});

describe('session validity (revocation wins over expiry)', () => {
  it('is valid when unrevoked and unexpired', () => {
    expect(isSessionValid({ revokedAt: null, expiresAt: FUTURE }, NOW)).toBe(true);
  });

  it('is invalid once expired (expiry is strict — not valid at the boundary)', () => {
    expect(isExpired({ expiresAt: NOW }, NOW)).toBe(true);
    expect(isSessionValid({ revokedAt: null, expiresAt: NOW }, NOW)).toBe(false);
    expect(isSessionValid({ revokedAt: null, expiresAt: PAST }, NOW)).toBe(false);
  });

  it('is invalid when revoked, even if still unexpired', () => {
    const session = { revokedAt: NOW, expiresAt: FUTURE };
    expect(isRevoked(session)).toBe(true);
    expect(isSessionValid(session, NOW)).toBe(false);
  });
});
