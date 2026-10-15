/**
 * Structured JSON logger (CLP-00-10).
 *
 * The operational baseline requires structured, redacted logs with STABLE
 * fields. This is a small, dependency-free `LoggerService` implementation that
 * emits ONE JSON object per line to `stdout`/`stderr` with a fixed field set:
 *
 *   { time, level, context, msg, ...fields, requestId? }
 *
 * Every record is passed through {@link redactRecord} before serialization, so
 * no password/cookie/token/session/CSRF/authorization/DB-URL value can be
 * emitted even if a caller passes one in `fields`.
 *
 * No external telemetry/metrics/tracing vendor is used (forbidden by the task
 * contract) — this writes to the process streams only. The logger is wireable
 * as the Nest application logger (`app.useLogger`) and as a Nest provider.
 */

import { Injectable, type LoggerService } from '@nestjs/common';

import { REDACTED, redactRecord, scrubString } from './redaction';

/** Log severity levels, most severe first, used for `setLevels` filtering. */
export const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** A sink receives the already-serialized, already-redacted line. */
export type LogSink = (line: string, level: LogLevel) => void;

/**
 * The stable, always-present fields of a structured record. Additional
 * event-specific fields are merged on top under `fields`.
 */
export interface StructuredLogRecord {
  readonly time: string;
  readonly level: LogLevel;
  readonly context: string;
  readonly msg: string;
  readonly requestId?: string;
  readonly [field: string]: unknown;
}

/** Options for {@link StructuredLogger}. */
export interface StructuredLoggerOptions {
  /** Fixed context name (e.g. `Bootstrap`, `Health`). */
  context?: string;
  /** Levels to emit; anything not listed is dropped. Defaults to all. */
  levels?: readonly LogLevel[];
  /** Custom sink; defaults to writing JSON lines to stdout/stderr. */
  sink?: LogSink;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

/** Default sink: one JSON line; `error`/`warn` to stderr, the rest to stdout. */
function defaultSink(line: string, level: LogLevel): void {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly context: string;
  private readonly enabled: Set<LogLevel>;
  private readonly sink: LogSink;
  private readonly now: () => Date;

  constructor(options: StructuredLoggerOptions = {}) {
    this.context = options.context ?? 'App';
    this.enabled = new Set(options.levels ?? LOG_LEVELS);
    this.sink = options.sink ?? defaultSink;
    this.now = options.now ?? (() => new Date());
  }

  /** Create a child logger that shares the sink but uses a new context. */
  child(context: string): StructuredLogger {
    return new StructuredLogger({
      context,
      levels: [...this.enabled],
      sink: this.sink,
      now: this.now,
    });
  }

  /** Emit a structured record at the given level. */
  private write(level: LogLevel, msg: unknown, fields: Record<string, unknown> = {}): void {
    if (!this.enabled.has(level)) return;

    // The message is always scrubbed; field NAMES carry the sensitive-key
    // decision, and every value is deep-redacted.
    const record: StructuredLogRecord = {
      time: this.now().toISOString(),
      level,
      context: this.context,
      msg: scrubString(typeof msg === 'string' ? msg : String(msg)),
      ...(redactRecord(fields) as Record<string, unknown>),
    };

    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      // Never let a non-serializable field break logging; emit a minimal line.
      line = JSON.stringify({
        time: record.time,
        level,
        context: this.context,
        msg: REDACTED,
        serializationError: true,
      });
    }
    this.sink(line, level);
  }

  log(message: unknown, ...optional: unknown[]): void {
    const context = this.takeContext(optional);
    this.write('log', message, context ? { requestContext: context } : {});
  }

  error(message: unknown, ...optional: unknown[]): void {
    const { fields, context } = this.splitErrorArgs(optional);
    this.write('error', message, { ...fields, ...(context ? { requestContext: context } : {}) });
  }

  warn(message: unknown, ...optional: unknown[]): void {
    const context = this.takeContext(optional);
    this.write('warn', message, context ? { requestContext: context } : {});
  }

  debug(message: unknown, ...optional: unknown[]): void {
    const context = this.takeContext(optional);
    this.write('debug', message, context ? { requestContext: context } : {});
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    const context = this.takeContext(optional);
    this.write('verbose', message, context ? { requestContext: context } : {});
  }

  /**
   * Emit an explicit structured event with named fields (the preferred API for
   * application code). `event` becomes the stable `msg`; additional fields are
   * merged, then redacted.
   */
  event(
    level: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
    requestId?: string,
  ): void {
    const withId = requestId ? { ...fields, requestId } : fields;
    this.write(level, event, withId);
  }

  /** Nest passes the context as the LAST string argument for log/warn/etc. */
  private takeContext(optional: unknown[]): string | undefined {
    const last = optional[optional.length - 1];
    return typeof last === 'string' ? last : undefined;
  }

  /** `logger.error(msg, stack?, context?)` — capture stack as a safe field. */
  private splitErrorArgs(optional: unknown[]): {
    fields: Record<string, unknown>;
    context?: string;
  } {
    const fields: Record<string, unknown> = {};
    let context: string | undefined;
    for (const arg of optional) {
      if (typeof arg === 'string') {
        context = arg;
      } else if (arg instanceof Error) {
        fields.error = { name: arg.name, message: arg.message };
      }
    }
    return { fields, context };
  }
}
