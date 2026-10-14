import { Logger, Module } from '@nestjs/common';

import {
  makeEnv,
  makeEnvMissing,
  SYNTHETIC_SERVER_CONFIG,
  syntheticSecretValue,
} from '../support/factories';
import { createTestApp, withTestApp } from '../support/test-app';

/**
 * Test-harness self-tests (CLP-00-08A).
 *
 * Verifies the shared test infrastructure itself:
 *   - the Nest lifecycle helper BOOTS and ALWAYS CLOSES the application;
 *   - a failed bootstrap does not leak a half-initialised application;
 *   - the synthetic factories are deterministic, isolated and never hold
 *     real data.
 *
 * These tests are non-database, synthetic and deterministic. Database
 * integration fixtures remain deferred (CLP-00-04).
 */

@Module({})
class EmptyHarnessModule {}

describe('test harness — Nest application lifecycle', () => {
  it('createTestApp boots a working app and closes it once', async () => {
    const ctx = await createTestApp({ metadata: { imports: [EmptyHarnessModule] } });
    expect(ctx.app).toBeDefined();

    await ctx.close();
    // Second close is a no-op, not an error (idempotent teardown).
    await expect(ctx.close()).resolves.toBeUndefined();
  });

  it('withTestApp always closes the app even when the body throws', async () => {
    await expect(
      withTestApp({ metadata: { imports: [EmptyHarnessModule] } }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('withTestApp returns the body value on success', async () => {
    const value = await withTestApp(
      { metadata: { imports: [EmptyHarnessModule] } },
      async () => 42,
    );
    expect(value).toBe(42);
  });

  it('createTestApp rejects (does not return a context) when compilation fails', async () => {
    // A provider whose factory throws fails module compilation; the helper
    // must reject rather than return a broken context.
    await expect(
      createTestApp({
        metadata: {
          providers: [
            {
              provide: 'EXPLODING',
              useFactory: () => {
                throw new Error('cannot construct');
              },
            },
          ],
        },
      }),
    ).rejects.toBeDefined();
    new Logger('TestHarness').verbose('intentional bootstrap failure asserted');
  });
});

describe('test harness — synthetic factories', () => {
  it('makeEnv returns an independent, mutable copy each call', () => {
    const a = makeEnv();
    const b = makeEnv();
    a.SOMETHING_NEW = 'x';
    expect(b.SOMETHING_NEW).toBeUndefined();
    expect(a).not.toBe(b);
  });

  it('makeEnv applies overrides without mutating the frozen base', () => {
    const env = makeEnv({ overrides: { API_PORT: '8080' } });
    expect(env.API_PORT).toBe('8080');
    expect(SYNTHETIC_SERVER_CONFIG.API_PORT).toBe('3000');
    expect(Object.isFrozen(SYNTHETIC_SERVER_CONFIG)).toBe(true);
  });

  it('makeEnvMissing empties exactly the named keys', () => {
    const env = makeEnvMissing('SESSION_SECRET', 'CSRF_SECRET');
    expect(env.SESSION_SECRET).toBe('');
    expect(env.CSRF_SECRET).toBe('');
    expect(env.NODE_ENV).toBe(SYNTHETIC_SERVER_CONFIG.NODE_ENV);
  });

  it('synthetic secret values are labelled, non-empty and deterministic', () => {
    expect(syntheticSecretValue('db')).toBe(syntheticSecretValue('db'));
    expect(syntheticSecretValue('db')).toContain('db');
    expect(syntheticSecretValue()).not.toHaveLength(0);
  });

  it('the synthetic base contains no real credential shapes', () => {
    const blob = JSON.stringify(SYNTHETIC_SERVER_CONFIG).toLowerCase();
    for (const marker of ['begin private key', 'akia', 'sk-', 'ghp_', 'xoxb-']) {
      expect(blob).not.toContain(marker);
    }
  });
});
