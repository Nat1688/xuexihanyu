import { SECRET_KEYS } from './config.schema';

/**
 * Public SPA configuration projection (CLP-00-03).
 *
 * The browser may receive ONLY an explicit allowlist of non-secret,
 * `VITE_`-prefixed keys. This module is the single place that decides what is
 * public; anything not listed never crosses the server→SPA boundary.
 *
 * Security rules (task contract):
 *   - No `VITE_` key may contain database, password, session, CSRF, token,
 *     secret or credential data.
 *   - Even an allowlisted key is rejected at runtime if its NAME looks
 *     secret-bearing (defence in depth against a future careless addition).
 */

/** The ONLY public SPA keys. Currently just the API base URL. */
export const SPA_PUBLIC_KEYS: readonly string[] = ['VITE_API_BASE_URL'] as const;

/** Substrings that must never appear in a public SPA key name. */
export const FORBIDDEN_PUBLIC_KEY_TOKENS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'session',
  'csrf',
  'token',
  'credential',
  'database',
  'postgres',
  'db_',
  'private',
  'apikey',
  'api_key',
] as const;

/** Names that must not start with the public prefix. */
const VITE_PREFIX = 'VITE_';

/**
 * True when a key NAME is safe to expose to the browser. Requiring the `VITE_`
 * prefix avoids the scenario where an unprefixed SERVER key is mistakenly
 * copied into the browser bundle (VITE only inlines `VITE_`-prefixed vars, but
 * we fail closed at the projection layer too).
 */
export function isPublicSpaKey(key: string): boolean {
  if (!key.startsWith(VITE_PREFIX)) return false;
  if (SECRET_KEYS.has(key)) return false;
  const lower = key.toLowerCase();
  return !FORBIDDEN_PUBLIC_KEY_TOKENS.some((token) => lower.includes(token));
}

/**
 * Project an environment source down to the documented public SPA config.
 * Returns only allowlisted, non-secret `VITE_` keys that are actually present.
 */
export function publicSpaConfig(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SPA_PUBLIC_KEYS) {
    if (!isPublicSpaKey(key)) {
      // Programmer error — a forbidden key was added to the allowlist.
      throw new Error(`Refusing to expose non-public key '${key}' to the SPA`);
    }
    const value = env[key];
    if (value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}
