/**
 * Public SPA configuration (CLP-00-03).
 *
 * The browser bundle may contain ONLY explicit, non-secret public values.
 * Vite statically replaces `import.meta.env.VITE_*` expressions at build time;
 * we read exactly one documented key and NEVER touch `process.env` or any
 * arbitrary server variable (which would not be inlined anyway, but failing
 * closed here keeps the boundary explicit and auditable).
 *
 * Security rules:
 *   - No database/session/CSRF/token/secret/credential data may appear here.
 *   - Only the documented public key below is allowed.
 */

/** Documented public keys (the SPA may use only these). */
export const PUBLIC_CONFIG_KEYS = {
  /** Base URL of the CLP API, e.g. http://localhost:3000 */
  apiBaseUrl: 'VITE_API_BASE_URL',
} as const;

export interface PublicConfig {
  readonly apiBaseUrl: string;
}

/**
 * Resolve the public SPA config. `VITE_API_BASE_URL` is optional in the
 * skeleton: when unset the SPA has no API to call yet (no feature uses it),
 * so we fall back to a same-origin empty base rather than inventing a secret.
 */
export function getPublicConfig(): PublicConfig {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const apiBaseUrl = typeof raw === 'string' ? raw.trim() : '';

  // Fail closed at runtime too: refuse anything that looks like a secret even
  // if someone misconfigures the (non-secret) public key.
  if (/password|secret|token|csrf|session/i.test(apiBaseUrl)) {
    throw new Error('VITE_API_BASE_URL must not contain secret-bearing values');
  }

  return Object.freeze({ apiBaseUrl });
}
