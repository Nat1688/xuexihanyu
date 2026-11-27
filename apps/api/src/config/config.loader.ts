import { SECRET_KEYS, serverConfigSchema, type ServerConfig } from './config.schema';

/**
 * Server configuration loading & fail-fast validation (CLP-00-03).
 *
 * `loadServerConfig` reads the approved environment keys, validates them with
 * the typed schema, and either returns an immutable typed config object or
 * throws a `ConfigError` carrying a SAFE diagnostic.
 *
 * Safety contract:
 *   - A diagnostic may NAME a key that is missing or invalid.
 *   - A diagnostic must NEVER contain the VALUE of a key, and in particular
 *     never the value of a secret key.
 *
 * Unknown-key handling: the real OS environment contains many unrelated
 * variables (PATH, HOME, npm_*, ...). We therefore project the environment
 * down to the approved `SERVER_CONFIG_KEYS` before validation, and only reject
 * "unknown" keys when the caller explicitly opts in
 * (`rejectUnknownKeys: true`) — used for controlled config objects in tests
 * and future config-file loading, NOT for `process.env`.
 */

/** Error category for machine-readable failure handling. */
export type ConfigErrorCategory = 'missing' | 'invalid' | 'unknown';

export class ConfigError extends Error {
  readonly category: ConfigErrorCategory;
  /** Affected configuration KEYS only — never values. */
  readonly keys: readonly string[];
  /** Per-key, value-free messages. */
  readonly issues: readonly string[];

  constructor(category: ConfigErrorCategory, keys: readonly string[], issues: readonly string[]) {
    super(ConfigError.formatMessage(keys, issues));
    this.name = 'ConfigError';
    this.category = category;
    this.keys = keys;
    this.issues = issues;
  }

  private static formatMessage(keys: readonly string[], issues: readonly string[]): string {
    const summary = keys.length ? keys.join(', ') : 'configuration';
    const detail = issues.length ? ` (${issues.join('; ')})` : '';
    return `Invalid server configuration: ${summary}${detail}`;
  }
}

/** The environment source; narrowed so tests can inject a controlled object. */
export type EnvSource = Record<string, string | undefined>;

/** Keys consumed by the server config boundary (server-only). */
export const SERVER_CONFIG_KEYS: readonly string[] = [
  'NODE_ENV',
  'API_PORT',
  'SPA_ORIGIN',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'SESSION_SECRET',
  'SESSION_TTL_MINUTES',
  'CSRF_SECRET',
  'LC03B_PREVIEW_ENABLED',
];

const KNOWN_KEY_SET: ReadonlySet<string> = new Set(SERVER_CONFIG_KEYS);

export interface LoadServerConfigOptions {
  /**
   * When true, any key in the source that is not an approved
   * `SERVER_CONFIG_KEYS` entry fails validation as `unknown`. Default false so
   * a real `process.env` (full of unrelated system variables) passes through.
   */
  rejectUnknownKeys?: boolean;
}

/**
 * Validate the environment and return a frozen typed config object.
 *
 * @throws ConfigError when any required key is missing or invalid.
 */
export function loadServerConfig(
  env: EnvSource = process.env,
  options: LoadServerConfigOptions = {},
): Readonly<ServerConfig> {
  const { rejectUnknownKeys = false } = options;

  // 1. Unknown-key guard (opt-in) — compare key NAMES only.
  if (rejectUnknownKeys) {
    const unknown = Object.keys(env).filter((k) => !KNOWN_KEY_SET.has(k));
    if (unknown.length) {
      throw new ConfigError('unknown', unknown, [
        `unknown configuration key(s): ${unknown.join(', ')}`,
      ]);
    }
  }

  // 2. Project down to approved keys.
  const raw: Record<string, string | undefined> = {};
  for (const key of SERVER_CONFIG_KEYS) {
    raw[key] = env[key];
  }

  // 3. Pre-check required keys for true absence/emptiness. This is more
  //    reliable than inspecting Zod issues (a `z.coerce` schema reports an
  //    absent numeric key as "NaN", not "undefined", which would misclassify
  //    a missing key as an invalid one).
  const missing: string[] = [];
  for (const key of SERVER_CONFIG_KEYS) {
    const value = raw[key];
    if (key !== 'LC03B_PREVIEW_ENABLED' && (value === undefined || value === '')) missing.push(key);
  }

  const result = serverConfigSchema.safeParse(raw);

  if (!result.success) {
    const keys = new Set<string>(missing);
    const messages: string[] = missing.map((key) => `${key} is required but was not set`);

    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '(root)';
      if (missing.includes(path)) continue; // already reported as missing
      keys.add(path);
      // `issue.message` from our schemas is value-free; Zod 3.x built-ins do
      // not embed input values either.
      messages.push(issue.message);
    }

    const uniqueKeys = [...keys];
    const category: ConfigErrorCategory = missing.length ? 'missing' : 'invalid';
    throw new ConfigError(category, uniqueKeys, messages);
  }

  return Object.freeze(result.data) as Readonly<ServerConfig>;
}

/**
 * Redact a config object for safe logging/tests: secret keys become a fixed
 * marker, non-secret keys keep their value. Guarantees no secret VALUE is
 * emitted even if a caller logs the result.
 */
export function redactServerConfig(config: ServerConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = SECRET_KEYS.has(key) ? '[REDACTED]' : String(value);
  }
  return out;
}
