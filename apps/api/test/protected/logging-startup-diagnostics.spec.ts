import { ConfigError } from '../../src/config/config.loader';
import {
  buildStartupDiagnostic,
  configErrorKeys,
  toRedactedRecord,
} from '../../src/modules/foundation/logging';

/**
 * Safe startup diagnostics tests (CLP-00-10).
 *
 * Proves each startup phase (config / prisma / http) yields a structured,
 * value-free diagnostic: the phase and a coarse error category are present, but
 * no secret value, connection URL or stack survives.
 */
describe('buildStartupDiagnostic', () => {
  it('produces a config-phase diagnostic with key NAMES only', () => {
    const error = new ConfigError(
      'missing',
      ['SESSION_SECRET', 'CSRF_SECRET'],
      ['SESSION_SECRET is required but was not set'],
    );
    const diagnostic = buildStartupDiagnostic('config', error, configErrorKeys(error));

    expect(diagnostic.event).toBe('startup.failed');
    expect(diagnostic.phase).toBe('config');
    expect(diagnostic.keys).toEqual(['SESSION_SECRET', 'CSRF_SECRET']);
    expect(diagnostic.category).toBe('ConfigError');
    // Key names are safe; values are not present.
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toMatch(/stack/i);
  });

  it('never includes a stack and scrubs a secret embedded in an error message', () => {
    const error = new Error('failed postgresql://u:synthetic-db-pass@host:5432/db');
    const diagnostic = buildStartupDiagnostic('prisma', error);

    expect(diagnostic.phase).toBe('prisma');
    expect(diagnostic.category).toBe('Error');
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain('synthetic-db-pass');
    expect(serialized).not.toContain('at '); // no stack frames
    expect(diagnostic.reason).toContain('Database is unreachable');
  });

  it('handles a non-Error throw safely', () => {
    const diagnostic = buildStartupDiagnostic('http', 'string failure');
    expect(diagnostic.phase).toBe('http');
    expect(diagnostic.category).toBe('string');
    expect(diagnostic.reason).toContain('HTTP server failed to start');
  });
});

describe('configErrorKeys', () => {
  it('extracts key names from a ConfigError', () => {
    const error = new ConfigError('invalid', ['API_PORT'], ['API_PORT is invalid']);
    expect(configErrorKeys(error)).toEqual(['API_PORT']);
  });

  it('returns undefined for a non-config error', () => {
    expect(configErrorKeys(new Error('nope'))).toBeUndefined();
    expect(configErrorKeys('nope')).toBeUndefined();
  });
});

describe('toRedactedRecord', () => {
  it('returns a plain redacted record', () => {
    const diagnostic = buildStartupDiagnostic(
      'config',
      new Error('password=synthetic-password-0000'),
    );
    const record = toRedactedRecord(diagnostic);
    expect(record.event).toBe('startup.failed');
    expect(JSON.stringify(record)).not.toContain('synthetic-password-0000');
  });
});
