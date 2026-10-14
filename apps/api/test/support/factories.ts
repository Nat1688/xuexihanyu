/**
 * Synthetic test data factories (CLP-00-08A).
 *
 * Scope: NON-DATABASE, non-domain fixtures only. This module produces
 * SYNTHETIC, deterministic, obviously-fake values for the configuration and
 * public-SPA boundary tests. It never models a user, student, credential or
 * any learning-domain entity, and it never contains real secrets or personal
 * data.
 *
 * Database integration fixtures (real PostgreSQL rows, an isolated
 * disposable test database, migration/session fixtures) are explicitly
 * DEFERRED and BLOCKED by CLP-00-04 (persistence/migrations). See
 * docs/Testing/TEST-HARNESS.md and the CLP-00-08A task contract.
 *
 * Every value here is a placeholder shaped like the real key so tests stay
 * readable while remaining unmistakably non-production. Values therefore look
 * like `synthetic-db-password-value` and never like a live credential.
 */

/** Env-source shape accepted by the config loader (a narrowed `process.env`). */
export type EnvSourceLike = Record<string, string | undefined>;

/** A frozen snapshot of all approved server config keys, synthetic values. */
export interface SyntheticServerConfig {
  readonly NODE_ENV: string;
  readonly API_PORT: string;
  readonly SPA_ORIGIN: string;
  readonly POSTGRES_HOST: string;
  readonly POSTGRES_PORT: string;
  readonly POSTGRES_DB: string;
  readonly POSTGRES_USER: string;
  readonly POSTGRES_PASSWORD: string;
  readonly SESSION_SECRET: string;
  readonly SESSION_TTL_MINUTES: string;
  readonly CSRF_SECRET: string;
}

/** The canonical synthetic env every config test starts from. */
export const SYNTHETIC_SERVER_CONFIG: SyntheticServerConfig = Object.freeze({
  NODE_ENV: 'test',
  API_PORT: '3000',
  SPA_ORIGIN: 'http://localhost:5173',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_DB: 'clp_test_placeholder',
  POSTGRES_USER: 'clp_test_user',
  POSTGRES_PASSWORD: 'synthetic-db-password-value',
  SESSION_SECRET: 'synthetic-session-secret-value',
  SESSION_TTL_MINUTES: '60',
  CSRF_SECRET: 'synthetic-csrf-secret-value',
});

/** Options for {@link makeEnv}. */
export interface MakeEnvOptions {
  /**
   * Additional keys spliced on top of the synthetic base. Pass `undefined`
   * for a base key to REMOVE it (simulating an unset variable).
   */
  overrides?: EnvSourceLike;
}

/**
 * Build a fresh env object from the synthetic base, applying overrides.
 *
 * Returns a NEW mutable object each call so a test can freely add/delete keys
 * without leaking state between tests (no shared mutable fixtures).
 */
export function makeEnv(options: MakeEnvOptions = {}): EnvSourceLike {
  const env: EnvSourceLike = { ...SYNTHETIC_SERVER_CONFIG };
  for (const [key, value] of Object.entries(options.overrides ?? {})) {
    env[key] = value;
  }
  return env;
}

/**
 * Build an env that is valid on every key EXCEPT the ones named, which are set
 * to `''` (empty string → treated as missing by the config boundary). Useful
 * for the "required key absent/empty" failure class.
 */
export function makeEnvMissing(...keys: readonly string[]): EnvSourceLike {
  const overrides: EnvSourceLike = {};
  for (const key of keys) overrides[key] = '';
  return makeEnv({ overrides });
}

/** A distinct, obviously-synthetic secret-shaped value. */
export function syntheticSecretValue(label = 'value'): string {
  return `synthetic-${label}-do-not-use-0000`;
}

/** Minimal env containing only the public SPA key, for projection tests. */
export function makePublicSpaEnv(apiBaseUrl = 'http://localhost:3000'): EnvSourceLike {
  return { VITE_API_BASE_URL: apiBaseUrl };
}
