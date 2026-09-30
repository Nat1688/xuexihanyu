import { z } from 'zod';

/**
 * Typed server configuration schema (CLP-00-03).
 *
 * This is the ONE approved boundary through which the API reads its runtime
 * environment. It replaces ad-hoc `process.env` access with a validated,
 * typed object. Two guarantees it must uphold:
 *
 *   1. Fail fast — invalid or missing required configuration aborts startup with
 *      a SAFE diagnostic. Error messages may name a missing/invalid KEY but must
 *      NEVER contain the (possibly secret) VALUE of that key.
 *   2. Secret boundary — server secrets are classified here and are never
 *      projected into the public SPA config (see `spa-config.ts`).
 *
 * Scope note: no database connection, session handling or auth endpoint is
 * implemented here. Database/session variable NAMES are declared and validated
 * so later approved tasks (persistence, identity) can consume the same typed
 * object without re-introducing raw `process.env` access.
 */

/** Allowed runtime environments. Anything else fails validation. */
export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

/** TCP port range (excludes 0/privileged-range surprises in config input). */
const PORT_MIN = 1;
const PORT_MAX = 65535;

const portSchema = z.coerce
  .number({ invalid_type_error: 'API_PORT must be a number' })
  .int('API_PORT must be an integer')
  .min(PORT_MIN, `API_PORT must be >= ${PORT_MIN}`)
  .max(PORT_MAX, `API_PORT must be <= ${PORT_MAX}`);

/**
 * An absolute http(s) origin with no path/query/hash and no trailing slash,
 * e.g. `http://localhost:5173`. Trailing slashes are normalised, but schemes
 * other than http/https, relative values and non-URL strings are rejected.
 * (Raw string length is capped to keep the failure message safe.)
 */
const originSchema = z
  .string({ invalid_type_error: 'SPA_ORIGIN must be a string' })
  .max(2048, 'SPA_ORIGIN is too long')
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPA_ORIGIN must be an absolute URL (e.g. http://localhost:5173)',
      });
      return z.NEVER;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPA_ORIGIN must use http or https',
      });
      return z.NEVER;
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPA_ORIGIN must be an origin only (no path, query or hash)',
      });
      return z.NEVER;
    }
    return url.origin;
  });

const requiredNonEmpty = (key: string) =>
  z
    .string({ invalid_type_error: `${key} must be a string` })
    .min(1, `${key} is required and must be non-empty`);

/**
 * The full server configuration schema.
 *
 * Classification (see README "Configuration boundary"):
 *   - NODE_ENV, API_PORT, SPA_ORIGIN  → server-required (validated, safe to expose indirectly)
 *   - POSTGRES_*                       → server-required (secret-bearing: password)
 *   - SESSION_* / CSRF_SECRET          → server-required (secret, later tasks)
 *   - VITE_* (public SPA)              → handled separately in `spa-config.ts`
 */
export const serverConfigSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS, {
      errorMap: () => ({
        message: `NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`,
      }),
    }),
    API_PORT: portSchema,
    SPA_ORIGIN: originSchema,

    POSTGRES_HOST: requiredNonEmpty('POSTGRES_HOST'),
    POSTGRES_PORT: portSchema,
    POSTGRES_DB: requiredNonEmpty('POSTGRES_DB'),
    POSTGRES_USER: requiredNonEmpty('POSTGRES_USER'),
    POSTGRES_PASSWORD: requiredNonEmpty('POSTGRES_PASSWORD'),

    SESSION_SECRET: requiredNonEmpty('SESSION_SECRET'),
    SESSION_TTL_MINUTES: z.coerce
      .number({ invalid_type_error: 'SESSION_TTL_MINUTES must be a number' })
      .int('SESSION_TTL_MINUTES must be an integer')
      .positive('SESSION_TTL_MINUTES must be > 0'),
    CSRF_SECRET: requiredNonEmpty('CSRF_SECRET'),
  })
  .strict();

export type ServerConfig = z.infer<typeof serverConfigSchema>;

/**
 * Keys whose VALUES are secrets. Used by the safe error formatter to guarantee
 * that a value is never embedded in a thrown or logged diagnostic, and by the
 * public SPA projection as a defence-in-depth denylist.
 */
export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'POSTGRES_PASSWORD',
  'SESSION_SECRET',
  'CSRF_SECRET',
]);

/** Keys that are required but not secret (may be named in diagnostics). */
export const PLAIN_REQUIRED_KEYS: ReadonlySet<string> = new Set([
  'NODE_ENV',
  'API_PORT',
  'SPA_ORIGIN',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'SESSION_TTL_MINUTES',
]);
