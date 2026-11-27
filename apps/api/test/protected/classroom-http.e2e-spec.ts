import { type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../../src/modules/identity/application/auth-service';
import { AuthExceptionFilter } from '../../src/modules/identity/http/auth-exception.filter';
import { AuthGuard } from '../../src/modules/identity/http/auth.guard';
import { RoleGuard } from '../../src/modules/identity/http/role.guard';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../../src/modules/identity/application/cookie-policy';
import { hashCsrfToken, newCsrfToken } from '../../src/modules/identity/domain/csrf';
import {
  StudentClassroomController,
  TeacherClassroomController,
} from '../../src/modules/classrooms/classroom.controller';
import { ClassroomService } from '../../src/modules/classrooms/classroom-service';
import { StudentService } from '../../src/modules/student/application/student-service';

const classId = '00000000-0000-4000-8000-000000000001';
const csrf = newCsrfToken();
const service = {
  rotate: jest.fn(async () => ({ code: 'synthetic', expiresAt: '2026-10-30T00:00:00Z' })),
  revoke: jest.fn(async () => ({ ok: true })),
  enroll: jest.fn(async () => ({ ok: true })),
  join: jest.fn(async () => ({ ok: true })),
  classes: jest.fn(async () => []),
  assignments: jest.fn(async () => []),
  invitation: jest.fn(async () => ({ state: 'NONE', expiresAt: null })),
  progress: jest.fn(async () => ({ attempts: 0 })),
};
describe('CL-01 real HTTP authentication/RBAC/CSRF chain (no database)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudentClassroomController, TeacherClassroomController],
      providers: [
        AuthGuard,
        RoleGuard,
        { provide: APP_FILTER, useClass: AuthExceptionFilter },
        { provide: ClassroomService, useValue: service },
        { provide: StudentService, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            resolveSession: async (token: string) =>
              ['TEACHER', 'STUDENT', 'ADMIN'].includes(token)
                ? {
                    principal: { publicId: classId, roles: [token] },
                    csrfHash: hashCsrfToken(csrf),
                    sessionId: 'synthetic',
                  }
                : null,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());
  const mutations: [string, string, string][] = [
    [`/teacher/classes/${classId}/invitation`, 'TEACHER', 'rotate'],
    [`/teacher/classes/${classId}/invitation/revoke`, 'TEACHER', 'revoke'],
    [`/teacher/classes/${classId}/enrollments`, 'TEACHER', 'enroll'],
    ['/student/classes/join', 'STUDENT', 'join'],
    [`/student/classes/${classId}/assignments/${classId}/exercises/next`, 'STUDENT', 'assignments'],
  ];
  it.each(mutations)(
    'denies anonymous/missing/invalid CSRF without application calls: %s',
    async (path, role) => {
      await request(app.getHttpServer()).post(path).expect(401);
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${role}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${role}; ${CSRF_COOKIE_NAME}=${csrf}`)
        .set('X-CSRF-Token', newCsrfToken())
        .expect(403);
      for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    },
  );
  it.each(mutations)('denies inverse role with valid CSRF: %s', async (path, role) => {
    await request(app.getHttpServer())
      .post(path)
      .set(
        'Cookie',
        `${SESSION_COOKIE_NAME}=${role === 'STUDENT' ? 'TEACHER' : 'STUDENT'}; ${CSRF_COOKIE_NAME}=${csrf}`,
      )
      .set('X-CSRF-Token', csrf)
      .expect(403);
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
  });
  it('allows valid teacher/admin mutations and returns no-store', async () => {
    for (const role of ['TEACHER', 'ADMIN']) {
      const res = await request(app.getHttpServer())
        .post(`/teacher/classes/${classId}/invitation`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${role}; ${CSRF_COOKIE_NAME}=${csrf}`)
        .set('X-CSRF-Token', csrf)
        .expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(service.rotate).toHaveBeenCalledTimes(2);
  });
  it.each(['/student/classes', '/student/assignments', '/student/progress'])(
    'GET remains read-only and requires student: %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Cookie', `${SESSION_COOKIE_NAME}=TEACHER`)
        .expect(403);
      const res = await request(app.getHttpServer())
        .get(path)
        .set('Cookie', `${SESSION_COOKIE_NAME}=STUDENT`)
        .expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(service.join).not.toHaveBeenCalled();
      expect(service.rotate).not.toHaveBeenCalled();
    },
  );
});
