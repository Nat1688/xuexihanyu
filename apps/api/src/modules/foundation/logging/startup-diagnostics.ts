/**
 * Safe startup diagnostics (CLP-00-10).
 *
 * Startup (config load, Prisma/database connect, HTTP listen) can fail. Each
 * failure must produce a SAFE, structured diagnostic that names the failing
 * PHASE and, at most, non-secret key NAMES — never a secret value, a stack
 * trace, a connection URL or internals. This module is the single place that
 * turns a startup failure into a redacted structured record.
 *
 * It builds records only; emission/exit is the caller's job (so tests can assert
 * the record without terminating the process).
 */

import { redactRecord, scrubString } from './redaction';

/** Startup phases that can fail. */
export type StartupPhase = 'config' | 'prisma' | 'http';

/** A safe, structured diagnostic for a startup failure. */
export interface StartupDiagnostic {
  readonly event: 'startup.failed';
  readonly phase: StartupPhase;
  readonly reason: string;
  /** Non-secret key NAMES referenced by the failure (never values). */
  readonly keys?: readonly string[];
  /** A coarse, non-leaking error category (error `name`, not a stack). */
  readonly category?: string;
}

/**
 * Per-phase public guidance. Wording is stable and value-free so operators can
 * grep it and callers cannot leak config through it.
 */
const PHASE_GUIDANCE: Record<StartupPhase, string> = {
  config: 'Server configuration is invalid; see the named key(s).',
  prisma: 'Database is unreachable; verify the local database is running.',
  http: 'HTTP server failed to start; verify the configured port is free.',
};

/**
 * Build a safe startup diagnostic from a phase, an error and an optional set of
 * (non-secret) key names. The error's NAME is kept for triage; its message is
 * scrubbed; no stack is ever included.
 */
export function buildStartupDiagnostic(
  phase: StartupPhase,
  error: unknown,
  keys?: readonly string[],
): StartupDiagnostic {
  const category = error instanceof Error ? error.name : typeof error;
  const detail = error instanceof Error ? scrubString(error.message) : String(error);
  const reason = detail ? `${PHASE_GUIDANCE[phase]} (${category})` : PHASE_GUIDANCE[phase];
  return {
    event: 'startup.failed',
    phase,
    reason,
    ...(keys && keys.length ? { keys: [...keys] } : {}),
    category,
  };
}

/**
 * Read the offending (non-secret) key NAMES off a config error, if present.
 * `ConfigError` (CLP-00-03) exposes a `keys` array of names only — never
 * values — so it is safe to surface. Any other error yields `undefined`.
 */
export function configErrorKeys(error: unknown): readonly string[] | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'keys' in error &&
    Array.isArray((error as { keys?: unknown }).keys)
  ) {
    return (error as { keys: unknown[] }).keys.filter((k): k is string => typeof k === 'string');
  }
  return undefined;
}

/** Redact a diagnostic for emission (defence in depth; it is already safe). */
export function toRedactedRecord(diagnostic: StartupDiagnostic): Record<string, unknown> {
  return redactRecord({ ...diagnostic });
}
