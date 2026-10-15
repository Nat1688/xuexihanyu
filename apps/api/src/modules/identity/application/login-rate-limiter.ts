/**
 * Bounded in-memory login rate limiter (CLP-00-06; ADR-003).
 *
 * ADR-003 requires login rate limiting but explicitly defers the concrete
 * production store ("apply rate limits … using an implementation selected with
 * deployment topology"). The CLP-00-06 contract therefore mandates a
 * **bounded in-memory development implementation** with **no distributed
 * provider and no production claim**. This is exactly that.
 *
 * Design:
 *   - Fixed-window counter per key. Each key tracks a window start and a count.
 *   - The limiter is size-bounded: once `maxKeys` is reached, inserting a new
 *     key evicts entries that are past their window first, then the oldest by
 *     window start, so memory cannot grow without bound.
 *   - The clock is injected (`now`), so behaviour is deterministic in tests and
 *     no timers/`setInterval` leak between tests.
 *
 * It is intentionally NOT a security boundary by itself (in-memory state is
 * per-process and lost on restart); it is a bounded abuse control for a single
 * node, which the contract scopes it to be. Responses built on it must remain
 * uniform so the limiter never becomes an account-enumeration oracle.
 */

/** Result of a rate-limit check. */
export interface RateLimitResult {
  /** Whether the action is allowed right now. */
  readonly allowed: boolean;
  /** Remaining allowance within the current window (>= 0). */
  readonly remaining: number;
  /** Milliseconds until the current window resets (for `Retry-After`). */
  readonly retryAfterMs: number;
}

export interface LoginRateLimiterOptions {
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Maximum attempts permitted per key per window. */
  readonly maxAttempts: number;
  /** Maximum number of tracked keys (bounds memory). */
  readonly maxKeys: number;
  /** Clock injection for deterministic tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface Window {
  start: number;
  count: number;
}

/** The default, documented development policy: 10 attempts / 5 minutes / 5000 keys. */
export const DEFAULT_LOGIN_RATE_LIMIT: Omit<LoginRateLimiterOptions, 'now'> = Object.freeze({
  windowMs: 5 * 60 * 1000,
  maxAttempts: 10,
  maxKeys: 5000,
});

/**
 * A fixed-window, memory-bounded rate limiter.
 *
 * Note on keys: the caller composes a key from a *fingerprint* of the login
 * attempt (e.g. the normalized login and/or client IP). Keys are opaque strings
 * here; the limiter never interprets them and never stores raw credentials.
 */
export class LoginRateLimiter {
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  private readonly windows = new Map<string, Window>();

  constructor(options: LoginRateLimiterOptions = { ...DEFAULT_LOGIN_RATE_LIMIT }) {
    this.windowMs = options.windowMs;
    this.maxAttempts = options.maxAttempts;
    this.maxKeys = options.maxKeys;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Record one attempt for `key` and report the current allowance. The window
   * rolls over once `windowMs` has elapsed.
   */
  hit(key: string): RateLimitResult {
    const now = this.now();
    const existing = this.windows.get(key);

    let window: Window;
    if (!existing || now - existing.start >= this.windowMs) {
      window = { start: now, count: 0 };
      this.ensureCapacity(now, key);
      this.windows.set(key, window);
    } else {
      window = existing;
    }

    // Count the attempt unconditionally so the limiter can actually DENY:
    // allow while the count is within the window budget, deny beyond it.
    window.count += 1;

    const allowed = window.count <= this.maxAttempts;
    const remaining = Math.max(0, this.maxAttempts - window.count);
    const retryAfterMs = allowed ? 0 : Math.max(0, window.start + this.windowMs - now);
    return { allowed, remaining, retryAfterMs };
  }

  /** Current tracked-key count (observability/tests). */
  get size(): number {
    return this.windows.size;
  }

  /** Clear all state (tests). */
  reset(): void {
    this.windows.clear();
  }

  /** Keep the map bounded: drop expired windows, then the oldest entries. */
  private ensureCapacity(now: number, incomingKey: string): void {
    if (this.windows.size < this.maxKeys) return;
    // 1. Evict any window that has already expired.
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) {
        this.windows.delete(key);
      }
    }
    // 2. If still full and the incoming key is new, evict the oldest window.
    while (this.windows.size >= this.maxKeys) {
      let oldestKey: string | undefined;
      let oldestStart = Number.POSITIVE_INFINITY;
      for (const [key, window] of this.windows) {
        if (window.start < oldestStart) {
          oldestStart = window.start;
          oldestKey = key;
        }
      }
      if (oldestKey === undefined || oldestKey === incomingKey) break;
      this.windows.delete(oldestKey);
    }
  }
}
