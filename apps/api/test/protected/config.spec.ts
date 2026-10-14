import { ConfigError, loadServerConfig, redactServerConfig } from '../../src/config/config.loader';
import { SECRET_KEYS } from '../../src/config/config.schema';
import { makeEnv, makeEnvMissing, SYNTHETIC_SERVER_CONFIG } from '../support/factories';

/**
 * Config boundary tests (CLP-00-03).
 *
 * Fixtures use SYNTHETIC values only (see `test/support/factories.ts`).
 * No real secret ever appears.
 * Required coverage (task contract):
 *   - valid config parse;
 *   - missing API/runtime config failure;
 *   - invalid API port failure;
 *   - invalid/unsafe SPA origin failure;
 *   - secret field redaction / no value in thrown or logged error.
 */

const VALID_ENV: Record<string, string> = { ...SYNTHETIC_SERVER_CONFIG, NODE_ENV: 'development' };

function withEnv(
  overrides: Record<string, string | undefined>,
): Record<string, string | undefined> {
  // Default the environment to 'development' unless the test explicitly
  // overrides it (including an explicit `undefined` that simulates an unset
  // variable). `makeEnv` starts from the synthetic base and applies overrides.
  const base: Record<string, string | undefined> = {
    ...VALID_ENV,
    ...(Object.prototype.hasOwnProperty.call(overrides, 'NODE_ENV')
      ? {}
      : { NODE_ENV: 'development' }),
  };
  return makeEnv({ overrides: { ...base, ...overrides } });
}

describe('loadServerConfig — valid', () => {
  it('parses a valid development config into a frozen typed object', () => {
    const config = loadServerConfig(VALID_ENV);

    expect(config.NODE_ENV).toBe('development');
    expect(config.API_PORT).toBe(3000);
    expect(config.SPA_ORIGIN).toBe('http://localhost:5173');
    expect(config.POSTGRES_PORT).toBe(5432);
    expect(config.SESSION_TTL_MINUTES).toBe(60);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('coerces numeric strings and normalizes a trailing-slash origin', () => {
    const config = loadServerConfig(
      withEnv({ API_PORT: '8080', SPA_ORIGIN: 'https://app.example.com/' }),
    );
    expect(config.API_PORT).toBe(8080);
    expect(config.SPA_ORIGIN).toBe('https://app.example.com');
  });

  it('accepts every allowed environment value', () => {
    for (const env of ['development', 'test', 'production'] as const) {
      expect(loadServerConfig(withEnv({ NODE_ENV: env })).NODE_ENV).toBe(env);
    }
  });
});

describe('loadServerConfig — missing runtime config', () => {
  it('fails with category "missing" when a required key is absent', () => {
    let error: unknown;
    try {
      loadServerConfig(withEnv({ API_PORT: undefined }));
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConfigError);
    const cfgError = error as ConfigError;
    expect(cfgError.category).toBe('missing');
    expect(cfgError.keys).toContain('API_PORT');
    expect(cfgError.message).toContain('API_PORT');
  });

  it('fails when NODE_ENV is absent', () => {
    expect(() => loadServerConfig(makeEnvMissing('NODE_ENV'))).toThrow(ConfigError);
  });

  it('fails when a required secret key is empty', () => {
    let error: ConfigError | undefined;
    try {
      loadServerConfig(withEnv({ SESSION_SECRET: '' }));
    } catch (e) {
      error = e as ConfigError;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.keys).toContain('SESSION_SECRET');
  });
});

describe('loadServerConfig — invalid values', () => {
  it.each(['0', '-1', '65536', 'abc', '3.5', ''])('rejects invalid API_PORT %p', (port) => {
    expect(() => loadServerConfig(withEnv({ API_PORT: port }))).toThrow(ConfigError);
  });

  it('rejects an unknown environment name', () => {
    expect(() => loadServerConfig(withEnv({ NODE_ENV: 'staging' }))).toThrow(ConfigError);
  });

  it('rejects a non-positive SESSION_TTL_MINUTES', () => {
    expect(() => loadServerConfig(withEnv({ SESSION_TTL_MINUTES: '0' }))).toThrow(ConfigError);
  });

  it('treats an unknown extra key as a failure when strict validation is requested', () => {
    let error: ConfigError | undefined;
    try {
      loadServerConfig(withEnv({ SOMETHING_NEW: 'x' }), { rejectUnknownKeys: true });
    } catch (e) {
      error = e as ConfigError;
    }
    expect(error?.category).toBe('unknown');
    expect(error?.keys).toContain('SOMETHING_NEW');
  });

  it('ignores unrelated system variables by default (process.env-shaped source)', () => {
    // A real OS environment carries PATH etc.; the default must not reject it.
    expect(() => loadServerConfig(withEnv({ PATH: '/usr/bin', HOME: '/root' }))).not.toThrow();
  });
});

describe('loadServerConfig — invalid/unsafe SPA origin', () => {
  it.each([
    ['relative path', '/dashboard'],
    ['no scheme', 'localhost:5173'],
    ['ftp scheme', 'ftp://example.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['origin with path', 'http://localhost:5173/app'],
    ['origin with query', 'http://localhost:5173?a=1'],
    ['empty', ''],
  ])('rejects SPA_ORIGIN: %s', (_label, origin) => {
    expect(() => loadServerConfig(withEnv({ SPA_ORIGIN: origin }))).toThrow(ConfigError);
  });

  it('accepts http and https origins', () => {
    expect(loadServerConfig(withEnv({ SPA_ORIGIN: 'http://localhost:5173' })).SPA_ORIGIN).toBe(
      'http://localhost:5173',
    );
    expect(loadServerConfig(withEnv({ SPA_ORIGIN: 'https://clp.example.com' })).SPA_ORIGIN).toBe(
      'https://clp.example.com',
    );
  });
});

describe('loadServerConfig — secret redaction / no value leakage', () => {
  it('never includes a secret VALUE in the thrown error message', () => {
    const secretValue = 'super-synthetic-secret-9999';
    let error: ConfigError | undefined;
    try {
      // Make SESSION_SECRET invalid in a way that still carries the value in
      // the raw input, and force a different failure too, to be sure nothing
      // echoes.
      loadServerConfig(withEnv({ SESSION_SECRET: secretValue, API_PORT: 'abc' }));
    } catch (e) {
      error = e as ConfigError;
    }

    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.message).not.toContain(secretValue);
    expect(JSON.stringify(error?.issues)).not.toContain(secretValue);
    expect(error?.message).not.toContain('super-synthetic');
  });

  it('does not leak the DB password value even when other config fails', () => {
    const dbPassword = 'db-pass-should-not-leak-42';
    let error: ConfigError | undefined;
    try {
      loadServerConfig(withEnv({ POSTGRES_PASSWORD: dbPassword, NODE_ENV: 'nope' }));
    } catch (e) {
      error = e as ConfigError;
    }
    expect(error?.message).not.toContain(dbPassword);
    expect(error?.message).toContain('NODE_ENV');
  });

  it('redactServerConfig masks every SECRET_KEYS value', () => {
    const config = loadServerConfig(VALID_ENV);
    const redacted = redactServerConfig(config);

    for (const key of SECRET_KEYS) {
      expect(redacted[key]).toBe('[REDACTED]');
    }
    // Non-secret keys survive for diagnostics.
    expect(redacted.NODE_ENV).toBe('development');
    // The raw secret values must not appear anywhere in the redacted output.
    const blob = JSON.stringify(redacted);
    expect(blob).not.toContain(VALID_ENV.POSTGRES_PASSWORD);
    expect(blob).not.toContain(VALID_ENV.SESSION_SECRET);
    expect(blob).not.toContain(VALID_ENV.CSRF_SECRET);
  });
});
