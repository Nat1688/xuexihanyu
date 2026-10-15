import { LOG_LEVELS, StructuredLogger, type LogLevel } from '../../src/modules/foundation/logging';

/**
 * Structured logger tests (CLP-00-10).
 *
 * Proves the logger emits ONE JSON object per line with STABLE fields
 * (time/level/context/msg) and that a sensitive VALUE never appears in the
 * serialized line — whether passed as a named field or embedded in the message.
 *
 * No external telemetry is involved; the sink is injected so assertions are
 * deterministic and nothing is written to the real process streams.
 */
interface CapturedLine {
  level: LogLevel;
  record: Record<string, unknown>;
}

function capture(): { logger: StructuredLogger; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const logger = new StructuredLogger({
    context: 'Test',
    sink: (line, level) => lines.push({ level, record: JSON.parse(line) }),
    now: () => new Date('2026-10-15T12:00:00.000Z'),
  });
  return { logger, lines };
}

describe('StructuredLogger', () => {
  it('emits one JSON line with stable fields', () => {
    const { logger, lines } = capture();
    logger.event('log', 'startup.listening', { port: 3000, environment: 'production' });

    expect(lines).toHaveLength(1);
    expect(lines[0].record).toEqual({
      time: '2026-10-15T12:00:00.000Z',
      level: 'log',
      context: 'Test',
      msg: 'startup.listening',
      port: 3000,
      environment: 'production',
    });
  });

  it('redacts sensitive fields passed to an event', () => {
    const { logger, lines } = capture();
    logger.event('error', 'auth.failed', {
      password: 'synthetic-password-0000',
      cookie: 'clp_session=synthetic-cookie-0000',
      databaseUrl: 'postgresql://u:synthetic-db-pass@host/db',
      reason: 'invalid',
    });

    const serialized = JSON.stringify(lines[0].record);
    expect(serialized).not.toContain('synthetic-password-0000');
    expect(serialized).not.toContain('synthetic-cookie-0000');
    expect(serialized).not.toContain('synthetic-db-pass');
    expect(lines[0].record.password).toBe('[REDACTED]');
    expect(lines[0].record.reason).toBe('invalid');
  });

  it('scrubs secrets embedded in the message string', () => {
    const { logger, lines } = capture();
    logger.log('login failed for password=synthetic-password-0000');

    expect(lines[0].record.msg).not.toContain('synthetic-password-0000');
    expect(String(lines[0].record.msg)).toContain('[REDACTED]');
  });

  it('attaches requestId when provided', () => {
    const { logger, lines } = capture();
    logger.event('warn', 'request.slow', { ms: 900 }, 'req-123');
    expect(lines[0].record.requestId).toBe('req-123');
  });

  it('honours the level filter', () => {
    const lines: CapturedLine[] = [];
    const logger = new StructuredLogger({
      levels: ['error'],
      sink: (l, lvl) => lines.push({ level: lvl, record: JSON.parse(l) }),
    });
    logger.log('dropped');
    logger.debug('dropped');
    logger.error('kept');
    expect(lines).toHaveLength(1);
    expect(lines[0].record.msg).toBe('kept');
  });

  it('supports a Nest-style log(message, context) call shape', () => {
    const { logger, lines } = capture();
    logger.log('hello', 'SomeContext');
    expect(lines[0].record.msg).toBe('hello');
    expect(lines[0].record.requestContext).toBe('SomeContext');
  });

  it('does not throw on a non-serializable field and emits a safe fallback', () => {
    const { logger, lines } = capture();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logger.event('log', 'weird', { circular })).not.toThrow();
    expect(lines).toHaveLength(1);
    // redactValue converts the cycle to [Circular], so serialization succeeds.
    expect(lines[0].record.circular).toEqual({ self: '[Circular]' });
  });

  it('creates child loggers that share the sink with a new context', () => {
    const { logger, lines } = capture();
    const child = logger.child('Bootstrap');
    child.event('log', 'child.event', {});
    expect(lines[0].record.context).toBe('Bootstrap');
  });

  it('exposes the canonical level list', () => {
    expect(LOG_LEVELS).toContain('error');
    expect(LOG_LEVELS).toContain('log');
  });
});
