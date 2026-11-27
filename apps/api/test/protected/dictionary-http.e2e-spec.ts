import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { DictionaryController } from '../../src/modules/dictionary/controller';
import { DictionaryRateLimiter, DictionaryService } from '../../src/modules/dictionary/service';
import { AuthGuard } from '../../src/modules/identity/http/auth.guard';
import { RoleGuard } from '../../src/modules/identity/http/role.guard';
import { AuthService } from '../../src/modules/identity/application/auth-service';
import { AuthExceptionFilter } from '../../src/modules/identity/http/auth-exception.filter';
import { hashCsrfToken } from '../../src/modules/identity/domain/csrf';

describe('DICT HTTP authentication/RBAC/CSRF', () => {
  let app: INestApplication;
  let role = 'STUDENT';
  const proof = randomBytes(24).toString('base64url');
  const service = {
    search: jest.fn(() => ({ items: [], total: 0 })),
    categories: jest.fn(() => []),
    overview: jest.fn(),
    import: jest.fn(() => ({ databaseWrites: 0 })),
    report: jest.fn(),
    publicationPreview: jest.fn(() => ({ total: 2, blockers: [] })),
    changePublication: jest.fn(() => ({ total: 2, changed: 2 })),
    changeSourceRights: jest.fn(() => ({ rights: 'CONFIRMED' })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DictionaryController],
      providers: [
        AuthGuard,
        RoleGuard,
        DictionaryRateLimiter,
        { provide: DictionaryService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            resolveSession: async (session?: string) =>
              session === 'synthetic-session'
                ? {
                    principal: {
                      userId: '11111111-1111-4111-8111-111111111111',
                      publicId: '22222222-2222-4222-8222-222222222222',
                      roles: [role],
                    },
                    sessionId: 'synthetic',
                    csrfHash: hashCsrfToken(proof),
                  }
                : null,
          },
        },
        { provide: APP_FILTER, useClass: AuthExceptionFilter },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    role = 'STUDENT';
    jest.clearAllMocks();
  });
  const cookies = () => `clp_session=synthetic-session; clp_csrf=${proof}`;
  const groupPath = '/dictionary/admin/categories/11111111-1111-4111-8111-111111111111/publication';
  const rightsPath = '/dictionary/admin/sources/11111111-1111-4111-8111-111111111111/rights';
  it.each(['TEACHER', 'STUDENT'])(
    'refuses publication and source rights for %s',
    async (deniedRole) => {
      role = deniedRole;
      for (const path of [groupPath, rightsPath])
        await request(app.getHttpServer())
          .post(path)
          .set('Cookie', cookies())
          .set('X-CSRF-Token', proof)
          .send({})
          .expect(403);
      await request(app.getHttpServer())
        .get(groupPath + '-preview')
        .set('Cookie', cookies())
        .expect(403);
      expect(service.changePublication).not.toHaveBeenCalled();
      expect(service.changeSourceRights).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 'invalid'])(
    'rejects ADMIN mutation with missing/invalid CSRF %#',
    async (token) => {
      role = 'ADMIN';
      for (const path of [groupPath, rightsPath]) {
        const req = request(app.getHttpServer()).post(path).set('Cookie', cookies());
        if (token) req.set('X-CSRF-Token', token);
        await req.send({}).expect(403);
      }
      expect(service.changePublication).not.toHaveBeenCalled();
      expect(service.changeSourceRights).not.toHaveBeenCalled();
    },
  );
  it('uses authenticated ADMIN identity for valid publication and rights changes', async () => {
    role = 'ADMIN';
    await request(app.getHttpServer())
      .get(groupPath + '-preview')
      .set('Cookie', cookies())
      .expect(200)
      .expect('Cache-Control', 'no-store');
    for (const path of [groupPath, rightsPath])
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', cookies())
        .set('X-CSRF-Token', proof)
        .send({ confirmed: true })
        .expect(200)
        .expect('Cache-Control', 'no-store');
    expect(service.changePublication).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      { confirmed: true },
    );
    expect(service.changeSourceRights).toHaveBeenCalled();
  });
  it('rejects anonymous readers', async () => {
    await request(app.getHttpServer()).get('/dictionary/entries').expect(401);
    expect(service.search).not.toHaveBeenCalled();
  });
  it('permits authenticated read without CSRF and remains read-only', async () => {
    await request(app.getHttpServer())
      .get('/dictionary/entries')
      .set('Cookie', cookies())
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(service.search).toHaveBeenCalledWith({}, false);
    expect(service.import).not.toHaveBeenCalled();
  });
  it.each(['STUDENT', 'TEACHER'])('rejects %s administrative reads', async (value) => {
    role = value;
    await request(app.getHttpServer())
      .get('/dictionary/admin/entries')
      .set('Cookie', cookies())
      .expect(403);
    expect(service.search).not.toHaveBeenCalled();
  });
  it('allows ADMIN internal search', async () => {
    role = 'ADMIN';
    await request(app.getHttpServer())
      .get('/dictionary/admin/entries')
      .set('Cookie', cookies())
      .expect(200);
    expect(service.search).toHaveBeenCalledWith({}, true);
  });
  it.each(['/dictionary/admin/imports', '/dictionary/admin/imports/dry-run'])(
    'denies missing CSRF before import %s',
    async (route) => {
      role = 'ADMIN';
      await request(app.getHttpServer()).post(route).set('Cookie', cookies()).send({}).expect(403);
      expect(service.import).not.toHaveBeenCalled();
    },
  );
  it('denies forged CSRF before reports', async () => {
    await request(app.getHttpServer())
      .post('/dictionary/entries/11111111-1111-4111-8111-111111111111/reports')
      .set('Cookie', cookies())
      .set('X-CSRF-Token', 'invalid')
      .send({ comment: 'a' })
      .expect(403);
    expect(service.report).not.toHaveBeenCalled();
  });
  it('valid CSRF does not allow a STUDENT to import', async () => {
    await request(app.getHttpServer())
      .post('/dictionary/admin/imports')
      .set('Cookie', cookies())
      .set('X-CSRF-Token', proof)
      .send({})
      .expect(403);
    expect(service.import).not.toHaveBeenCalled();
  });
});
