/**
 * Safe readiness check (CLP-00-10).
 *
 * `/health/ready` must distinguish "application up but dependency unavailable"
 * WITHOUT leaking an internal error, connection URL or schema. This module is
 * the single, injectable port that performs the dependency probe and collapses
 * EVERY outcome into a small, fixed vocabulary:
 *
 *   - `'up'`             — the dependency answered a trivial probe.
 *   - `'down'`           — the dependency did not answer in time / errored.
 *   - `'not-configured'` — no probe is wired (skeleton default).
 *
 * The probe NEVER returns or logs the underlying error message, URL or stack —
 * only the coarse state. A timeout bounds the check so a hung database cannot
 * hang `/health/ready` indefinitely.
 */

/** Fixed, non-enumerating dependency states. */
export type DependencyState = 'up' | 'down' | 'not-configured';

/** Result of a readiness probe. */
export interface ReadinessResult {
  readonly database: DependencyState;
}

/**
 * The minimal database-probe surface this check needs. Implemented by a thin
 * adapter over the Prisma client so the check has no hard Prisma dependency and
 * is trivially fakeable in tests.
 */
export interface DatabaseProbe {
  /**
   * Run a trivial liveness query. Resolves when the database answered; rejects
   * (or hangs) otherwise.
   */
  ping(): Promise<void>;
}

/** Injection token for the {@link DatabaseProbe}. */
export const DATABASE_PROBE = Symbol('DATABASE_PROBE');

/** Default probe timeout in milliseconds. */
export const DEFAULT_PROBE_TIMEOUT_MS = 1500;

/** Options for {@link ReadinessService}. */
export interface ReadinessServiceOptions {
  /** Probe to run; omit for `'not-configured'`. */
  probe?: DatabaseProbe;
  /** Timeout for the probe; defaults to {@link DEFAULT_PROBE_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Wraps a probe with a timeout and a fail-closed outcome. Returns the COARSE
 * state only; the underlying error never escapes and is never surfaced.
 */
export class ReadinessService {
  private readonly probe?: DatabaseProbe;
  private readonly timeoutMs: number;

  constructor(options: ReadinessServiceOptions = {}) {
    this.probe = options.probe;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  }

  /** Report readiness of each dependency using the fixed vocabulary. */
  async check(): Promise<ReadinessResult> {
    if (!this.probe) {
      return { database: 'not-configured' };
    }
    const ok = await this.probeWithTimeout(this.probe, this.timeoutMs);
    return { database: ok ? 'up' : 'down' };
  }

  /** Race the probe against a timeout; ANY failure collapses to `false`. */
  private async probeWithTimeout(probe: DatabaseProbe, timeoutMs: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      // Do not keep the event loop alive purely for the timer.
      if (typeof timer.unref === 'function') timer.unref();
    });
    try {
      const attempted = probe.ping().then(
        () => true,
        () => false, // swallow the error entirely — never surface it
      );
      return await Promise.race([attempted, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
