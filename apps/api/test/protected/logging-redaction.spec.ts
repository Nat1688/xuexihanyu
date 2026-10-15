import {
  REDACTED,
  isSensitiveKey,
  redactRecord,
  redactValue,
  scrubString,
  SENSITIVE_KEY_VOCABULARY,
} from '../../src/modules/foundation/logging';

/**
 * Redaction boundary tests (CLP-00-10).
 *
 * Proves that a sensitive VALUE never survives redaction, whether it arrives as
 * a named field or embedded in a free-text message / error. Fixtures are
 * SYNTHETIC (see factories conventions) — no real secret appears.
 *
 * Scope: password, cookie, token, session, CSRF, authorization and DB-URL
 * values (the CLP-00-10 redaction list).
 */
describe('isSensitiveKey', () => {
  it.each([
    'password',
    'POSTGRES_PASSWORD',
    'sessionToken',
    'session_id',
    'csrf',
    'x-csrf-token',
    'cookie',
    'authorization',
    'authorizationHeader',
    'secret',
    'apiKey',
    'DATABASE_URL',
    'dbUrl',
    'connectionString',
    'credential',
  ])('treats %s as sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['port', 'host', 'environment', 'status', 'path', 'method', 'requestId'])(
    'does not treat %s as sensitive',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );

  it('covers the declared CLP-00-10 vocabulary', () => {
    for (const term of ['password', 'cookie', 'token', 'session', 'csrf', 'authorization']) {
      expect(SENSITIVE_KEY_VOCABULARY).toContain(term);
    }
  });
});

describe('redactValue — field-name based', () => {
  it('replaces sensitive fields with the fixed marker, keeping safe fields', () => {
    const out = redactRecord({
      level: 'info',
      password: 'synthetic-password-0000',
      sessionToken: 'synthetic-session-token-0000',
      authorization: 'Bearer synthetic-token-0000',
      cookie: 'clp_session=synthetic-cookie-0000',
      csrf: 'synthetic-csrf-0000',
      databaseUrl: 'postgresql://u:synthetic-db-pass@host:5432/db',
      port: 3000,
    });

    expect(out.level).toBe('info');
    expect(out.port).toBe(3000);
    for (const key of [
      'password',
      'sessionToken',
      'authorization',
      'cookie',
      'csrf',
      'databaseUrl',
    ]) {
      expect(out[key]).toBe(REDACTED);
    }
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('synthetic-password-0000');
    expect(serialized).not.toContain('synthetic-session-token-0000');
    expect(serialized).not.toContain('synthetic-db-pass');
  });

  it('recurses into nested objects and arrays', () => {
    const out = redactValue({
      outer: { password: 'p', safe: 'ok' },
      list: [{ token: 't' }, 'plain'],
    }) as Record<string, unknown>;

    expect((out.outer as Record<string, unknown>).password).toBe(REDACTED);
    expect((out.outer as Record<string, unknown>).safe).toBe('ok');
    expect((out.list as unknown[])[0]).toEqual({ token: REDACTED });
    expect((out.list as unknown[])[1]).toBe('plain');
  });

  it('converts an Error to a safe {name, message} without a stack', () => {
    const out = redactValue(new Error('boom for password=secret-value')) as Record<string, unknown>;
    expect(out).toEqual({ name: 'Error', message: `boom for password=${REDACTED}` });
    expect(JSON.stringify(out)).not.toContain('secret-value');
  });

  it('handles circular references without throwing', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    const out = redactValue(a) as Record<string, unknown>;
    expect(out.name).toBe('a');
    expect(out.self).toBe('[Circular]');
  });

  it('preserves null/undefined/boolean/number primitives', () => {
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
    expect(redactValue(true)).toBe(true);
    expect(redactValue(42)).toBe(42);
  });
});

describe('scrubString — value-based (free text)', () => {
  it('scrubs scheme://user:pass@host userinfo in a connection URL', () => {
    const out = scrubString('failed postgresql://clp_app:synthetic-db-pass@127.0.0.1:5432/clp_dev');
    expect(out).not.toContain('synthetic-db-pass');
    expect(out).toContain('postgresql://[REDACTED]@127.0.0.1:5432/clp_dev');
  });

  it('scrubs sensitive key=value pairs in free text', () => {
    const out = scrubString('login attempt password=synthetic-password-0000 cookie=abc token=xyz');
    expect(out).not.toContain('synthetic-password-0000');
    expect(out).not.toContain('abc');
    expect(out).toContain(REDACTED);
  });

  it('scrubs quoted JSON-ish pairs', () => {
    const out = scrubString('{"password":"synthetic-password-0000","ok":"keep"}');
    expect(out).not.toContain('synthetic-password-0000');
    expect(out).toContain('keep');
  });

  it('leaves a benign string unchanged', () => {
    expect(scrubString('listening on port 3000')).toBe('listening on port 3000');
  });
});
