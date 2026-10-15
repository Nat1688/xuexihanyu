/**
 * Structured-log redaction boundary (CLP-00-10).
 *
 * The operational baseline requires that structured logs NEVER carry the VALUE
 * of anything sensitive — passwords, cookies, session/CSRF tokens,
 * `Authorization` headers, and database connection URLs (whose userinfo carries
 * a password). This module is the single, dependency-free place that guarantee
 * is implemented, so every log call routes through it.
 *
 * Two complementary strategies, defence in depth:
 *
 *   1. KEY-based redaction — any field whose NAME looks sensitive (matching the
 *      {@link SENSITIVE_KEY_PATTERN} vocabulary) is masked regardless of its
 *      value shape. This catches structured fields such as
 *      `{ password: '...' }`, `{ cookie: '...' }`, `{ authorization: '...' }`.
 *   2. STRING scrubbing — a free-text message is scanned for the same
 *      sensitive `key=value` / `"key":"value"` shapes AND for `scheme://user:pass@host`
 *      connection-string userinfo, and every discovered secret is replaced with
 *      a fixed marker. This catches secrets embedded in a message or an error
 *      string that the field-name heuristic would miss.
 *
 * Redaction is intentionally CONSERVATIVE: when in doubt, redact. The fixed
 * marker is {@link REDACTED} so tests can assert absence of the raw value and
 * presence of the marker.
 */

/** The fixed placeholder substituted for every redacted value. */
export const REDACTED = '[REDACTED]';

/**
 * The sensitive-key vocabulary (case-insensitive substring match against the
 * field NAME). Mirrors the CLP-00-10 scope list: password, cookie, token,
 * session, CSRF, authorization, DB URL (connectionString / databaseUrl / url
 * when it carries userinfo). Kept as a single exported vocabulary so the log
 * contract is auditable in one place.
 */
export const SENSITIVE_KEY_VOCABULARY: readonly string[] = [
  'password',
  'passwd',
  'pwd',
  'cookie',
  'token',
  'session',
  'csrf',
  'authorization',
  'auth',
  'secret',
  'credential',
  'connectionstring',
  'databaseurl',
  'datasourceurl',
  'dburl',
  'apikey',
  'api_key',
  'privatekey',
];

/**
 * Pattern built from {@link SENSITIVE_KEY_VOCABULARY}. A field name containing
 * any vocabulary term (case-insensitive, ignoring `_`/`-` separators) is
 * treated as sensitive — so `DATABASE_URL`, `databaseUrl`, `db-url` and
 * `POSTGRES_PASSWORD` all match.
 */
export const SENSITIVE_KEY_PATTERN = new RegExp(
  `(${SENSITIVE_KEY_VOCABULARY.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'i',
);

/** Fold a key name for matching: lower-case and drop `_`/`-` separators. */
function foldKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** The vocabulary folded the same way, for separator-insensitive matching. */
const SENSITIVE_KEYS_FOLDED: ReadonlySet<string> = new Set(
  SENSITIVE_KEY_VOCABULARY.map((k) => foldKey(k)),
);

/** True when a field NAME should have its value redacted. */
export function isSensitiveKey(key: string): boolean {
  const folded = foldKey(key);
  if (SENSITIVE_KEY_PATTERN.test(key) || SENSITIVE_KEY_PATTERN.test(folded)) return true;
  // Separator-insensitive containment: a folded vocabulary term appears in the
  // folded key (e.g. `POSTGRES_PASSWORD` → `postgrespassword` contains
  // `password`; `SESSION_TTL_MINUTES` → `sessionttlminutes` contains `session`).
  for (const term of SENSITIVE_KEYS_FOLDED) {
    if (folded.includes(term)) return true;
  }
  return false;
}

/** Recursion guard for very deep/looping structures. */
const MAX_DEPTH = 6;

/**
 * A PostgreSQL/HTTP(S) URL carrying `user:pass@host` userinfo (a credential).
 * Matches the `scheme://user:pass@` prefix so only the userinfo is replaced,
 * preserving host/db for diagnosis without leaking the password.
 */
const URL_WITH_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi;

/**
 * A `key=value` / `"key":"value"` pair inside a free-text string whose key is
 * sensitive. Handles:
 *   - an optional leading quote on the key  `"password": "..."`;
 *   - `=` / `:` separators (with optional quote/space);
 *   - single/double/backtick-quoted or unquoted values.
 * Only the VALUE is replaced; the key and separator are preserved.
 */
function scrubSensitivePairs(input: string): string {
  // Match a broad candidate key token (quoted or bare) followed by `=`/`:`,
  // then VALIDATE the key in code via {@link isSensitiveKey} (separator-tolerant
  // and vocabulary-driven). This keeps one source of truth for sensitivity.
  const pair = new RegExp(
    `(["'\`]?)([A-Za-z_][\\w.-]*)\\1?(\\s*[=:]\\s*)(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`|([^\\s,;]+))`,
    'g',
  );
  return input.replace(pair, (match, lead: string, key: string, sep: string) => {
    if (!isSensitiveKey(key)) return match;
    return `${lead}${key}${lead}${sep}${REDACTED}`;
  });
}

/**
 * Scrub a free-text string: replace connection-string userinfo and any
 * sensitive `key=value` pairs with {@link REDACTED}. Exported so the logger can
 * sanitize message strings and so tests can assert the behavior directly.
 */
export function scrubString(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  let out = input.replace(URL_WITH_USERINFO, (_m, scheme: string) => `${scheme}${REDACTED}@`);
  out = scrubSensitivePairs(out);
  return out;
}

/**
 * Deeply redact a structured value for logging.
 *
 * - Objects/arrays recurse (bounded depth); a field whose NAME is sensitive
 *   becomes {@link REDACTED}; every remaining string is {@link scrubString}d
 *   (so a secret embedded in a message is still removed).
 * - Errors are converted to a safe `{ name, message }` (never a stack) with the
 *   message scrubbed.
 * - Functions/symbols/bigints become a type tag rather than a live value.
 * - Circular references become `[Circular]`.
 */
export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'number' || t === 'boolean') return value;
  if (t === 'bigint') return `${String(value)}n`;
  if (t === 'string') return scrubString(value as string);
  if (t === 'function') return '[Function]';
  if (t === 'symbol') return value.toString();

  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }

  if (depth >= MAX_DEPTH) return '[Truncated]';

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(val, depth + 1, seen);
    }
    return out;
  }

  return value;
}

/**
 * Redact a structured log record (a flat-ish object) into a new, plain object
 * safe to serialize. Guarantees no sensitive VALUE survives.
 */
export function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return redactValue(record) as Record<string, unknown>;
}
