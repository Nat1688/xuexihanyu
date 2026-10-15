import { ReadinessService, type DatabaseProbe } from '../../src/modules/foundation/logging';

/**
 * Readiness check tests (CLP-00-10).
 *
 * Proves the safe distinction between not-configured / up / down, that a slow
 * probe is bounded by a timeout, and that a probe FAILURE NEVER surfaces the
 * underlying error (no URL, no schema, no message).
 */
describe('ReadinessService', () => {
  it('reports not-configured when no probe is wired', async () => {
    const service = new ReadinessService();
    await expect(service.check()).resolves.toEqual({ database: 'not-configured' });
  });

  it('reports up when the probe resolves', async () => {
    const probe: DatabaseProbe = { ping: async () => undefined };
    const service = new ReadinessService({ probe });
    await expect(service.check()).resolves.toEqual({ database: 'up' });
  });

  it('reports down when the probe rejects, without surfacing the error', async () => {
    const probe: DatabaseProbe = {
      ping: async () => {
        throw new Error('ECONNREFUSED postgresql://u:synthetic-db-pass@db:5432/clp?schema=x');
      },
    };
    const service = new ReadinessService({ probe });
    const result = await service.check();
    expect(result).toEqual({ database: 'down' });
    expect(JSON.stringify(result)).not.toContain('synthetic-db-pass');
  });

  it('reports down when the probe exceeds the timeout', async () => {
    const probe: DatabaseProbe = { ping: () => new Promise<void>(() => undefined) };
    const service = new ReadinessService({ probe, timeoutMs: 20 });
    await expect(service.check()).resolves.toEqual({ database: 'down' });
  });

  it('reports up when the probe answers within the timeout', async () => {
    const probe: DatabaseProbe = {
      ping: () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
    };
    const service = new ReadinessService({ probe, timeoutMs: 200 });
    await expect(service.check()).resolves.toEqual({ database: 'up' });
  });
});
