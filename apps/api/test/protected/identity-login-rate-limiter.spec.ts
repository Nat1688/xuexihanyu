/**
 * Bounded login rate-limiter unit tests (CLP-00-06; ADR-003).
 *
 * The contract mandates a bounded in-memory development implementation with no
 * distributed provider and no production claim. These tests prove the bounded,
 * deterministic behaviour: a fixed window rolls over, allowance is reported
 * correctly, and the tracked-key map cannot grow without bound.
 *
 * The clock is injected, so there are no timers and no cross-test leakage.
 */
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  LoginRateLimiter,
} from '../../src/modules/identity/application/login-rate-limiter';

describe('login rate limiter (fixed window, bounded memory)', () => {
  it('documents the development policy (10 attempts / 5 min / 5000 keys)', () => {
    expect(DEFAULT_LOGIN_RATE_LIMIT).toEqual({
      windowMs: 5 * 60 * 1000,
      maxAttempts: 10,
      maxKeys: 5000,
    });
  });

  it('allows up to maxAttempts then denies within the same window', () => {
    let clock = 0;
    const limiter = new LoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 3,
      maxKeys: 10,
      now: () => clock,
    });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    const third = limiter.hit('k');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = limiter.hit('k');
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('rolls the window over once windowMs has elapsed', () => {
    let clock = 0;
    const limiter = new LoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 1,
      maxKeys: 10,
      now: () => clock,
    });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(false);
    clock = 1000; // window elapsed
    expect(limiter.hit('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    let clock = 0;
    const limiter = new LoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 1,
      maxKeys: 10,
      now: () => clock,
    });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(false);
  });

  it('never exceeds maxKeys tracked keys (bounded memory)', () => {
    let clock = 0;
    const limiter = new LoginRateLimiter({
      windowMs: 10_000,
      maxAttempts: 1,
      maxKeys: 3,
      now: () => clock,
    });
    for (let i = 0; i < 50; i += 1) {
      clock += 1;
      limiter.hit(`key-${i}`);
    }
    expect(limiter.size).toBeLessThanOrEqual(3);
  });

  it('evicts expired windows before oldest live ones when at capacity', () => {
    let clock = 0;
    const limiter = new LoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 1,
      maxKeys: 2,
      now: () => clock,
    });
    limiter.hit('a'); // start 0 → expires at 1000
    clock = 900;
    limiter.hit('b'); // start 900 → expires at 1900 (live at 1500)
    clock = 1500; // 'a' expired (1500 > 1000); 'b' still live
    limiter.hit('c'); // must evict the expired 'a', not the live 'b'
    expect(limiter.size).toBeLessThanOrEqual(2);
    // 'b' survived, so a second hit on 'b' within its window is denied.
    expect(limiter.hit('b').allowed).toBe(false);
  });

  it('reports remaining allowance and a zero retryAfter when allowed', () => {
    let clock = 0;
    const limiter = new LoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 2,
      maxKeys: 10,
      now: () => clock,
    });
    const r = limiter.hit('k');
    expect(r.remaining).toBe(1);
    expect(r.retryAfterMs).toBe(0);
  });

  it('reset() clears all state (test hygiene)', () => {
    const limiter = new LoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 1,
      maxKeys: 10,
      now: () => 0,
    });
    limiter.hit('k');
    limiter.reset();
    expect(limiter.size).toBe(0);
  });

  it('defaults the clock to Date.now (no injected clock required)', () => {
    const limiter = new LoginRateLimiter({ windowMs: 1000, maxAttempts: 1, maxKeys: 10 });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(false);
  });
});
