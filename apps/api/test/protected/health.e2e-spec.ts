import { Module } from '@nestjs/common';

import { HealthController } from '../../src/modules/health/health.controller';
import {
  DATABASE_PROBE,
  ReadinessService,
  type DatabaseProbe,
  type DependencyState,
} from '../../src/modules/foundation/logging';
import { createTestApp, type TestAppContext } from '../support/test-app';

/**
 * Health scaffold smoke test (CLP-00-02) + safe readiness distinction (CLP-00-10).
 *
 * Proves the application boots and the safe health scaffold responds without
 * exposing internals.
 *
 * Readiness (CLP-00-10) is exercised against EXPLICIT fake probes so the test is
 * deterministic and NEVER contacts a real PostgreSQL: the readiness state is
 * driven by the injected {@link DatabaseProbe}. This keeps `npm test`
 * independent of a running database while still covering the up / down /
 * not-configured distinction and the "no internal leak" requirement.
 *
 * The Nest application lifecycle is owned by the shared helper
 * (`test/support/test-app.ts`, CLP-00-08A) so teardown always closes the app.
 */

/** A probe that never answers in time (simulates an unavailable database). */
const hangingProbe: DatabaseProbe = { ping: () => new Promise<void>(() => undefined) };

/** Build a health slice wired to a specific fake probe (or none). */
function buildHealthSlice(probe?: DatabaseProbe) {
  @Module({
    controllers: [HealthController],
    providers: [
      { provide: DATABASE_PROBE, useValue: probe },
      {
        provide: ReadinessService,
        useFactory: () => new ReadinessService({ probe, timeoutMs: 50 }),
      },
    ],
  })
  class HealthSliceModule {}

  return HealthSliceModule;
}

describe('Health scaffold', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    // No probe wired → ready reports "not-configured" (skeleton/DB-less env).
    ctx = await createTestApp({ metadata: { imports: [buildHealthSlice(undefined)] } });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /health/live returns ok', async () => {
    const res = await ctx.http.get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns ok without leaking internals', async () => {
    const res = await ctx.http.get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['password', 'secret', 'stack', 'token', 'connectionstring']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('GET /health/ready reports dependency readiness honestly (DB not configured)', async () => {
    // CLP-00-02/10 boundary: with no probe wired, readiness is
    // application-level only and must NOT claim the database is reachable.
    const res = await ctx.http.get('/health/ready').expect(200);
    expect(res.body.dependencies).toEqual({ database: 'not-configured' });
  });

  it('health probes are non-cacheable (no-store) on both endpoints', async () => {
    for (const path of ['/health/live', '/health/ready']) {
      const res = await ctx.http.get(path).expect(200);
      expect(String(res.headers['cache-control'] ?? '')).toContain('no-store');
    }
  });

  it('unknown routes are rejected with 404 (no accidental catch-all surface)', async () => {
    await ctx.http.get('/health/does-not-exist').expect(404);
  });
});

describe('Health readiness distinction (CLP-00-10, fake probes)', () => {
  it('reports database "up" with 200 when the probe answers', async () => {
    const ctx = await createTestApp({
      metadata: { imports: [buildHealthSlice({ ping: async () => undefined })] },
    });
    try {
      const res = await ctx.http.get('/health/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok', dependencies: { database: 'up' } });
    } finally {
      await ctx.close();
    }
  });

  it('reports database "down" with 503 when the probe rejects — without leaking internals', async () => {
    const ctx = await createTestApp({
      metadata: {
        imports: [
          buildHealthSlice({
            ping: async () => {
              throw new Error('connect ECONNREFUSED postgresql://u:p@db:5432/secret?schema=x');
            },
          }),
        ],
      },
    });
    try {
      const res = await ctx.http.get('/health/ready').expect(503);
      expect(res.body).toEqual({ status: 'error', dependencies: { database: 'down' } });
      const serialized = JSON.stringify(res.body);
      for (const forbidden of ['ECONNREFUSED', 'postgresql', 'secret', 'schema', 'password']) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      await ctx.close();
    }
  });

  it('reports database "down" with 503 when the probe times out', async () => {
    const ctx = await createTestApp({
      metadata: { imports: [buildHealthSlice(hangingProbe)] },
    });
    try {
      const res = await ctx.http.get('/health/ready').expect(503);
      const state: DependencyState = res.body.dependencies.database;
      expect(state).toBe('down');
    } finally {
      await ctx.close();
    }
  });
});
