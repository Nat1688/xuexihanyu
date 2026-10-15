/**
 * Session/CSRF cookie policy (CLP-00-06; ADR-003).
 *
 * ADR-003 fixes the cookie boundary:
 *   - the session cookie is `HttpOnly` (no browser-accessible bearer token);
 *   - `Secure` OUTSIDE explicitly documented local HTTP development;
 *   - a narrow `Path` (`/`), no `Domain` (host-only), and an environment-
 *     appropriate `SameSite`;
 *   - explicit `Max-Age` matching the server session TTL.
 *
 * `SameSite=Lax` is the CP-00 choice: it blocks cross-site state-changing
 * requests (CSRF defence in depth) while allowing top-level navigation logins.
 * `SameSite=None` is deliberately NOT used (it would require `Secure` and widen
 * cross-site exposure the Owner has not approved).
 *
 * The CSRF cookie is intentionally NOT `HttpOnly` — the double-submit
 * mechanism requires the SPA to read it and echo it in a header. It carries no
 * authority on its own (the server additionally verifies the bound session
 * hash), so exposing it to script is safe under the CP-00 XSS model.
 *
 * No cookie `Domain` is set: the cookie is host-only, which is the narrowest
 * scope and avoids the cross-subdomain leakage a `Domain` attribute would add.
 * Production `Domain`/TLS configuration is explicitly out of scope (CLP-00-06).
 */
import type { NodeEnvironment } from '../../../config/config.schema';

/** Session cookie name (opaque token lives here; HttpOnly). */
export const SESSION_COOKIE_NAME = 'clp_session';

/** CSRF cookie name (readable by the SPA; double-submit proof). */
export const CSRF_COOKIE_NAME = 'clp_csrf';

/** Path scope: the whole API surface, nothing wider. */
export const COOKIE_PATH = '/';

/** SameSite policy for both cookies in CP-00. */
export const COOKIE_SAME_SITE = 'Lax' as const;

/** The environment-resolved cookie attributes shared by both cookies. */
export interface CookiePolicy {
  readonly name: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'Lax';
  readonly path: string;
  /** Max-Age in SECONDS (matches the session TTL). */
  readonly maxAgeSeconds: number;
}

/**
 * True when cookies must be `Secure`: everything except explicitly documented
 * local HTTP development. `test` is treated like production here so a
 * regression that weakens production cookies is caught by tests that also run
 * for `test`. Only `development` (local HTTP) may omit `Secure`.
 */
export function shouldUseSecureCookies(env: NodeEnvironment): boolean {
  return env !== 'development';
}

/** Build the session cookie policy for the given environment + TTL. */
export function sessionCookiePolicy(env: NodeEnvironment, ttlMinutes: number): CookiePolicy {
  return Object.freeze({
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: shouldUseSecureCookies(env),
    sameSite: COOKIE_SAME_SITE,
    path: COOKIE_PATH,
    maxAgeSeconds: Math.max(0, Math.floor(ttlMinutes * 60)),
  });
}

/** Build the CSRF cookie policy (readable by the SPA). */
export function csrfCookiePolicy(env: NodeEnvironment, ttlMinutes: number): CookiePolicy {
  return Object.freeze({
    name: CSRF_COOKIE_NAME,
    httpOnly: false,
    secure: shouldUseSecureCookies(env),
    sameSite: COOKIE_SAME_SITE,
    path: COOKIE_PATH,
    maxAgeSeconds: Math.max(0, Math.floor(ttlMinutes * 60)),
  });
}

/**
 * Serialize a `Set-Cookie` value from a policy + value. Uses `Max-Age` (not
 * `Expires`) to avoid client-clock dependence. `Secure`/`HttpOnly` are appended
 * only when the policy requires them.
 */
export function serializeCookie(policy: CookiePolicy, value: string): string {
  const parts = [
    `${policy.name}=${encodeURIComponent(value)}`,
    `Path=${policy.path}`,
    `Max-Age=${policy.maxAgeSeconds}`,
    `SameSite=${policy.sameSite}`,
  ];
  if (policy.httpOnly) parts.push('HttpOnly');
  if (policy.secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Serialize a `Set-Cookie` that immediately CLEARS a cookie (used on logout):
 * empty value and `Max-Age=0`, same path/flags so the browser matches and
 * removes the original.
 */
export function serializeClearedCookie(policy: CookiePolicy): string {
  return serializeCookie({ ...policy, maxAgeSeconds: 0 }, '');
}
