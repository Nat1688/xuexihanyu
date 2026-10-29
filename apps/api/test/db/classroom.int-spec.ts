/** CL-01 only. Explicit approved disposable URL/confirmation; never loads .env. */
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient, type Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/foundation/prisma.service';
import { ClassroomRepository } from '../../src/modules/classrooms/classroom.repository';
import { ClassroomService } from '../../src/modules/classrooms/classroom-service';
import {
  StudentClassroomController,
  TeacherClassroomController,
} from '../../src/modules/classrooms/classroom.controller';
import {
  newInvitation,
  type ClassroomActor,
} from '../../src/modules/classrooms/classroom-contract';
import { StudentService } from '../../src/modules/student/application/student-service';
import { AuthService } from '../../src/modules/identity/application/auth-service';
import { AuthExceptionFilter } from '../../src/modules/identity/http/auth-exception.filter';
import { AuthGuard } from '../../src/modules/identity/http/auth.guard';
import { RoleGuard } from '../../src/modules/identity/http/role.guard';
import { hashCsrfToken, newCsrfToken } from '../../src/modules/identity/domain/csrf';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../../src/modules/identity/application/cookie-policy';

const url = process.env.CL01_TEST_DATABASE_URL;
function approvedTarget(value: string | undefined): boolean {
  if (!value || process.env.CL01_TEST_CONFIRM !== 'APPROVED_CL01_DISPOSABLE_ONLY') return false;
  try {
    const target = new URL(value);
    return (
      target.protocol === 'postgresql:' &&
      target.hostname === '127.0.0.1' &&
      target.port === '55440' &&
      target.pathname === '/clp_cl01_test' &&
      decodeURIComponent(target.username) === 'clp_cl01_test'
    );
  } catch {
    return false;
  }
}
if (url && !approvedTarget(url)) throw new Error('CL01_DISPOSABLE_TARGET_REJECTED');
const describeDb = approvedTarget(url) ? describe : describe.skip;

describeDb('CL-01 PostgreSQL 17 / real HTTP authorization (synthetic auth adapter)', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const repository = new ClassroomRepository(db as unknown as PrismaService);
  let app: INestApplication;
  let teacher: ClassroomActor,
    other: ClassroomActor,
    student: ClassroomActor,
    second: ClassroomActor;
  let classId: string, internalClassId: string, studentInternal: string, secondLogin: string;
  const csrf = newCsrfToken();
  const now = () => new Date();
  const actors: Record<string, ClassroomActor> = {};
  async function counts() {
    return {
      enrollments: await db.classEnrollment.count(),
      invitations: await db.classInvitation.count(),
      events: await db.learningEvent.count(),
      submissions: await db.answerSubmission.count(),
      sessions: await db.answerSession.count(),
    };
  }
  function post(path: string, token: string, proof = true) {
    const req = request(app.getHttpServer())
      .post(path)
      .set('Cookie', `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${csrf}`);
    return proof ? req.set('X-CSRF-Token', csrf) : req;
  }
  beforeAll(async () => {
    const identity = await db.$queryRaw<
      { database: string; role: string; major: number }[]
    >`SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::int / 10000 AS major`;
    expect(identity[0]).toEqual({ database: 'clp_cl01_test', role: 'clp_cl01_test', major: 17 });
    const migrations = await db.$queryRaw<
      { total: number; successful: number }[]
    >`SELECT count(*)::int AS total,count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS successful FROM _prisma_migrations`;
    expect(migrations[0]).toEqual({ total: 10, successful: 10 });
    const suffix = randomUUID();
    async function user(name: string, role: 'TEACHER' | 'STUDENT') {
      return db.user.create({
        data: {
          login: `${name}-${suffix}@example.invalid`,
          loginNormalized: `${name}-${suffix}@example.invalid`,
          state: 'ACTIVE',
          roles: { create: { role } },
        },
      });
    }
    const [t, o, s, s2] = await Promise.all([
      user('teacher', 'TEACHER'),
      user('other', 'TEACHER'),
      user('student', 'STUDENT'),
      user('second', 'STUDENT'),
    ]);
    teacher = { publicId: t.publicId, roles: ['TEACHER'] };
    other = { publicId: o.publicId, roles: ['TEACHER'] };
    student = { publicId: s.publicId, roles: ['STUDENT'] };
    second = { publicId: s2.publicId, roles: ['STUDENT'] };
    studentInternal = s.id;
    secondLogin = s2.login;
    Object.assign(actors, {
      teacher,
      other,
      student,
      second,
      admin: { publicId: o.publicId, roles: ['ADMIN'] },
    });
    const klass = await db.teachingClass.create({
      data: { ownerId: t.id, title: 'Lớp kiểm thử CL-01' },
    });
    classId = klass.publicId;
    internalClassId = klass.id;
    const module = await Test.createTestingModule({
      controllers: [TeacherClassroomController, StudentClassroomController],
      providers: [
        AuthGuard,
        RoleGuard,
        { provide: APP_FILTER, useClass: AuthExceptionFilter },
        { provide: ClassroomRepository, useValue: repository },
        ClassroomService,
        { provide: StudentService, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            resolveSession: async (token: string) =>
              actors[token]
                ? {
                    principal: actors[token],
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
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it('rejects missing/invalid CSRF, wrong role and foreign ownership without PostgreSQL writes', async () => {
    const before = await counts();
    const path = `/teacher/classes/${classId}/invitation`;
    await post(path, 'teacher', false).expect(403);
    await post(path, 'teacher', false).set('X-CSRF-Token', newCsrfToken()).expect(403);
    await post(path, 'student').expect(403);
    await post(path, 'other').expect(404);
    await post('/student/classes/join', 'teacher').send({ code: 'invalid' }).expect(403);
    expect(await counts()).toEqual(before);
  });
  it('rotates, returns code once, refuses replaced/expired/revoked invitations without enrollment writes', async () => {
    const path = `/teacher/classes/${classId}/invitation`;
    const first = await post(path, 'teacher').expect(200);
    const next = await post(path, 'teacher').expect(200);
    const metadata = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', `${SESSION_COOKIE_NAME}=teacher`)
      .expect(200);
    expect(metadata.body.state).toBe('ACTIVE');
    expect(JSON.stringify(metadata.body)).not.toContain(next.body.code);
    const stored = await db.classInvitation.findUniqueOrThrow({
      where: { classId: internalClassId },
    });
    expect(stored.codeHash).not.toBe(next.body.code);
    const before = await db.classEnrollment.count();
    await expect(
      repository.join(student, newInvitation(now()).codeHash, now()),
    ).rejects.toMatchObject({ status: 422 });
    const invalid = await post('/student/classes/join', 'student')
      .send({ code: first.body.code })
      .expect(422);
    await db.classInvitation.update({
      where: { classId: internalClassId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await post('/student/classes/join', 'student')
      .send({ code: next.body.code })
      .expect(422);
    expect(expired.body).toEqual(invalid.body);
    await post(path + '/revoke', 'teacher').expect(200);
    const revoked = await post('/student/classes/join', 'student')
      .send({ code: next.body.code })
      .expect(422);
    expect(revoked.body).toEqual(invalid.body);
    expect(await db.classEnrollment.count()).toBe(before);
  });
  it('concurrent duplicate joins produce one enrollment; later revoke preserves the member', async () => {
    const code = newInvitation(now());
    await repository.rotate(teacher, classId, code.codeHash, code.expiresAt);
    const results = await Promise.allSettled([
      repository.join(student, code.codeHash, now()),
      repository.join(student, code.codeHash, now()),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((row) => row.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(
      await db.classEnrollment.count({
        where: { classId: internalClassId, studentId: studentInternal },
      }),
    ).toBe(1);
    await repository.revoke(teacher, classId, now());
    expect(await repository.classes(student)).toEqual([expect.objectContaining({ classId })]);
    expect(await repository.classes(second)).toEqual([]);
  });
  it('teacher exact-login enrollment accepts ACTIVE STUDENT only, preserves ADMIN override and rejects duplicates', async () => {
    const path = `/teacher/classes/${classId}/enrollments`;
    const before = await counts();
    await post(path, 'other').send({ login: secondLogin }).expect(404);
    await post(path, 'teacher')
      .send({ login: secondLogin })
      .set('X-CSRF-Token', newCsrfToken())
      .expect(403);
    expect(await counts()).toEqual(before);
    await post(path, 'admin').send({ login: secondLogin.toUpperCase() }).expect(201);
    await post(path, 'teacher').send({ login: secondLogin }).expect(409);
    expect(await repository.classes(second)).toHaveLength(1);
  });
  it('rechecks revocation after a controlled lock wait instead of accepting the earlier lookup', async () => {
    const code = newInvitation(now());
    await repository.rotate(teacher, classId, code.codeHash, code.expiresAt);
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM teaching_classes WHERE id = ${internalClassId}::uuid FOR UPDATE`;
        await tx.classInvitation.update({
          where: { classId: internalClassId },
          data: { revokedAt: now() },
        });
        locked();
        await gate;
      },
      { timeout: 15_000 },
    );
    await acquired;
    const joining = repository.join(student, code.codeHash, now()).then(
      () => ({ status: 0 }),
      (error: { status: number }) => error,
    );
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const rows = await db.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%teaching_classes%'`;
        if (rows[0].count > 0) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
    }
    await blocker;
    expect(await joining).toMatchObject({ status: 422 });
    expect(
      await db.classEnrollment.count({
        where: { classId: internalClassId, studentId: studentInternal },
      }),
    ).toBe(1);
  });
  it('transaction failure after insert rolls back the enrollment', async () => {
    const third = await db.user.create({
      data: {
        login: randomUUID(),
        loginNormalized: randomUUID(),
        state: 'ACTIVE',
        roles: { create: { role: 'STUDENT' } },
      },
    });
    const wrapped = {
      $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        db.$transaction(async (tx) => {
          await operation(tx);
          throw new Error('injected rollback');
        }),
    } as unknown as PrismaService;
    const failing = new ClassroomRepository(wrapped);
    await expect(failing.enroll(teacher, classId, third.loginNormalized)).rejects.toThrow(
      'injected rollback',
    );
    expect(
      await db.classEnrollment.count({ where: { classId: internalClassId, studentId: third.id } }),
    ).toBe(0);
  });
  it('exact-login enrollment refuses non-STUDENT and disabled accounts without enrollment writes', async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { publicId: teacher.publicId } });
    const disabled = await db.user.create({
      data: {
        login: randomUUID(),
        loginNormalized: randomUUID(),
        state: 'DISABLED',
        roles: { create: { role: 'STUDENT' } },
      },
    });
    const before = await counts();
    for (const login of [
      owner.loginNormalized,
      disabled.loginNormalized,
      'missing@example.invalid',
    ]) {
      await expect(repository.enroll(teacher, classId, login)).rejects.toMatchObject({
        status: 422,
        code: 'CLASSROOM_STUDENT_UNAVAILABLE',
      });
    }
    expect(await counts()).toEqual(before);
  });
  it('student reads only their assignments under current enrollment and PUBLISHED leaf visibility', async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { publicId: teacher.publicId } });
    const course = await db.course.create({
      data: { authorId: owner.id, slug: randomUUID(), title: 'CL01 Course' },
    });
    const unit = await db.unit.create({
      data: { courseId: course.id, slug: randomUUID(), title: 'CL01 Unit' },
    });
    const published = await db.lesson.create({
      data: {
        unitId: unit.id,
        slug: randomUUID(),
        title: 'Bài đã xuất bản',
        visibility: 'PUBLISHED',
      },
    });
    const draft = await db.lesson.create({
      data: {
        unitId: unit.id,
        slug: randomUUID(),
        title: 'Draft private content',
        position: 1,
        visibility: 'DRAFT',
      },
    });
    await db.lessonAssignment.createMany({
      data: [published, draft].map((lesson) => ({
        classId: internalClassId,
        studentId: studentInternal,
        lessonId: lesson.id,
      })),
    });
    const rows = await repository.assignments(student);
    expect(rows).toEqual([expect.objectContaining({ lessonId: published.publicId, classId })]);
    expect(JSON.stringify(rows)).not.toContain(published.id);
    expect(JSON.stringify(rows)).not.toContain('Draft private');
    expect(await repository.assignments(second)).toEqual([]);
    await expect(repository.assignments(student, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    const before = await counts();
    await request(app.getHttpServer())
      .get('/student/progress')
      .set('Cookie', `${SESSION_COOKIE_NAME}=student`)
      .expect(200);
    expect(await counts()).toEqual(before);
  });
});
