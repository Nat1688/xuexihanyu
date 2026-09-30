import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/**
 * Health scaffold smoke test (CLP-00-02).
 *
 * Proves the application boots and the safe health scaffold responds without
 * exposing internals. This is NOT the identity/RBAC test matrix (later tasks).
 */
describe('Health scaffold', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns ok without leaking internals', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['password', 'secret', 'stack', 'token', 'connectionstring']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
