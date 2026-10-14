import { createTestApp, type TestAppContext } from '../support/test-app';

/**
 * Health scaffold smoke test (CLP-00-02).
 *
 * Proves the application boots and the safe health scaffold responds without
 * exposing internals. This is NOT the identity/RBAC test matrix (later tasks).
 *
 * The Nest application lifecycle is owned by the shared helper
 * (`test/support/test-app.ts`, CLP-00-08A) so teardown always closes the app.
 */
describe('Health scaffold', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
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
    // CLP-00-02/10 boundary: readiness is application-level only; it must NOT
    // claim the database is reachable, because persistence does not exist yet.
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
