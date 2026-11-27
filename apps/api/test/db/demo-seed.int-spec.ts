import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SERVER_CONFIG } from '../../src/config/config.module';
import { PrismaService } from '../../src/modules/foundation/prisma.service';
import { SYNTHETIC_SERVER_CONFIG } from '../support/factories';
import {
  CONFIRMATION,
  assertDemoTarget,
  demoId,
  runDemoSeed,
} from '../../../../scripts/seed/db-seed-demo.cjs';

const url = process.env.DEMO_DATABASE_URL;
const decision = assertDemoTarget(url, process.env.DEMO_SEED_CONFIRM);
// An explicitly supplied but unsafe target is a failure, never a silent skip.
if (url && !decision.allowed) throw new Error('DS01 unsafe integration target');
const describeDb = decision.allowed ? describe : describe.skip;

describeDb('DS-01 PostgreSQL seed and real Student/Teacher HTTP', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  const password = randomBytes(24).toString('base64url');
  const options = { url: url!, confirmation: CONFIRMATION, password };
  const counts = async () => ({
    users: await prisma.user.count(),
    courses: await prisma.course.count(),
    units: await prisma.unit.count(),
    lessons: await prisma.lesson.count(),
    items: await prisma.learningItem.count(),
    links: await prisma.lessonLearningItem.count(),
    classes: await prisma.teachingClass.count(),
    enrollments: await prisma.classEnrollment.count(),
    assignments: await prisma.lessonAssignment.count(),
    evidence: await prisma.learningEvent.count(),
    mastery: await prisma.masteryProjection.count(),
    answers: await prisma.answerSubmission.count(),
    admissions: await prisma.courseApplication.count(),
  });
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    // Never reset or delete an existing demo. Verification requires a fresh DB.
    expect(Object.values(await counts()).every((n) => n === 0)).toBe(true);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it.each(['identities', 'content', 'assignments'])(
    'rolls back failure after %s',
    async (phase) => {
      const before = await counts();
      await expect(
        runDemoSeed({
          ...options,
          onPhase: async (p) => {
            if (p === phase) throw new Error('DS01 injected failure');
          },
        }),
      ).rejects.toThrow('DS01 injected failure');
      expect(await counts()).toEqual(before);
      expect(await prisma.passwordCredential.count()).toBe(0);
      expect(await prisma.userRoleAssignment.count()).toBe(0);
    },
  );

  it('refuses a pre-existing fixture login without changing the account', async () => {
    const sentinel = await prisma.user.create({
      data: {
        login: 'teacher.one@example.invalid',
        loginNormalized: 'teacher.one@example.invalid',
        state: 'DISABLED',
      },
    });
    const before = await counts();
    try {
      await expect(runDemoSeed(options)).rejects.toThrow('DS01_SCOPE_CONFLICT');
      expect(await counts()).toEqual(before);
      expect(await prisma.user.findUnique({ where: { id: sentinel.id } })).toEqual(sentinel);
    } finally {
      await prisma.user.delete({ where: { id: sentinel.id } });
    }
  });

  it('refuses an existing course slug and rolls back all new identities', async () => {
    const author = await prisma.user.create({
      data: { login: 'ds01-sentinel', loginNormalized: 'ds01-sentinel' },
    });
    const course = await prisma.course.create({
      data: { slug: 'demo-hello-chinese', title: 'Untouched sentinel', authorId: author.id },
    });
    const before = await counts();
    try {
      await expect(runDemoSeed(options)).rejects.toThrow('DS01_SCOPE_CONFLICT');
      expect(await counts()).toEqual(before);
      expect(await prisma.course.findUnique({ where: { id: course.id } })).toEqual(course);
    } finally {
      await prisma.course.delete({ where: { id: course.id } });
      await prisma.user.delete({ where: { id: author.id } });
    }
  });

  it('seeds twice and concurrently with stable IDs, credentials and dates', async () => {
    const result = await runDemoSeed(options);
    expect(result).toEqual({
      identities: 7,
      courses: 1,
      units: 2,
      lessons: 3,
      items: 13,
      classes: 1,
      enrollments: 2,
      assignments: 6,
    });
    const before = await counts();
    const credentials = await prisma.passwordCredential.findMany({ orderBy: { id: 'asc' } });
    const assignments = await prisma.lessonAssignment.findMany({ orderBy: { id: 'asc' } });
    const enrollments = await prisma.classEnrollment.findMany({ orderBy: { id: 'asc' } });
    const items = await prisma.learningItem.findMany({ orderBy: { id: 'asc' } });
    await runDemoSeed({ ...options, now: new Date('2030-01-01') });
    await Promise.all([runDemoSeed(options), runDemoSeed(options)]);
    expect(await counts()).toEqual(before);
    expect(await prisma.passwordCredential.findMany({ orderBy: { id: 'asc' } })).toEqual(
      credentials,
    );
    expect(await prisma.lessonAssignment.findMany({ orderBy: { id: 'asc' } })).toEqual(assignments);
    expect(await prisma.classEnrollment.findMany({ orderBy: { id: 'asc' } })).toEqual(enrollments);
    expect(await prisma.learningItem.findMany({ orderBy: { id: 'asc' } })).toEqual(items);
    expect(before).toEqual({
      users: 7,
      courses: 1,
      units: 2,
      lessons: 3,
      items: 13,
      links: 13,
      classes: 1,
      enrollments: 2,
      assignments: 6,
      evidence: 0,
      mastery: 0,
      answers: 0,
      admissions: 0,
    });
  });

  it('does not touch a non-demo item with identical text under the demo author', async () => {
    const author = await prisma.user.findUniqueOrThrow({
      where: { id: demoId('user:teacher.one') },
    });
    const sentinel = await prisma.learningItem.create({
      data: {
        authorId: author.id,
        kind: 'VOCABULARY',
        simplified: '你好',
        meaning: 'hello',
        pinyin: 'untouched',
      },
    });
    try {
      await runDemoSeed(options);
      expect(await prisma.learningItem.findUnique({ where: { id: sentinel.id } })).toEqual(
        sentinel,
      );
    } finally {
      await prisma.learningItem.delete({ where: { id: sentinel.id } });
    }
  });

  it('refuses account role drift instead of removing roles or rotating credentials', async () => {
    const userId = demoId('user:student.one');
    await prisma.userRoleAssignment.create({ data: { userId, role: 'TEACHER' } });
    const before = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true, credential: true },
    });
    try {
      await expect(runDemoSeed(options)).rejects.toThrow('DS01_SCOPE_CONFLICT');
      expect(
        await prisma.user.findUnique({
          where: { id: userId },
          include: { roles: true, credential: true },
        }),
      ).toEqual(before);
    } finally {
      await prisma.userRoleAssignment.delete({
        where: { userId_role: { userId, role: 'TEACHER' } },
      });
    }
  });

  it('refuses modified demo item content without overwriting it', async () => {
    const id = demoId('item:demo-hello-goodbye:0');
    const original = await prisma.learningItem.findUniqueOrThrow({ where: { id } });
    const changed = await prisma.learningItem.update({
      where: { id },
      data: { meaning: 'changed by test' },
    });
    try {
      await expect(runDemoSeed(options)).rejects.toThrow('DS01_SCOPE_CONFLICT');
      expect(await prisma.learningItem.findUnique({ where: { id } })).toEqual(changed);
    } finally {
      await prisma.learningItem.update({ where: { id }, data: { meaning: original.meaning } });
    }
  });

  it('repairs only demo publication and preserves data on a failed rerun', async () => {
    const lesson = await prisma.lesson.findFirstOrThrow();
    await prisma.lesson.update({ where: { id: lesson.id }, data: { visibility: 'DRAFT' } });
    const before = await prisma.lesson.findUnique({ where: { id: lesson.id } });
    await expect(
      runDemoSeed({
        ...options,
        onPhase: async (p) => {
          if (p === 'assignments') throw new Error('fail');
        },
      }),
    ).rejects.toThrow('fail');
    expect(await prisma.lesson.findUnique({ where: { id: lesson.id } })).toEqual(before);
    await runDemoSeed(options);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).visibility).toBe(
      'PUBLISHED',
    );
  });

  it('supports real login, Student exercise/evidence and teacher ownership APIs', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SERVER_CONFIG)
      .useValue(SYNTHETIC_SERVER_CONFIG)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
    const http = request(app.getHttpServer());
    async function login(key: string) {
      const res = await http
        .post('/auth/login')
        .send({ login: `${key}@example.invalid`, password })
        .expect(200);
      const cookies = (res.headers['set-cookie'] as unknown as string[]).map(
        (c) => c.split(';')[0],
      );
      const csrf = cookies.find((c) => c.startsWith('clp_csrf='))!.split('=')[1];
      return { cookies, csrf, id: res.body.user.publicId as string };
    }
    const student = await login('student.one');
    const owner = await login('teacher.two');
    const author = await login('teacher.one');
    await http
      .post('/auth/login')
      .send({ login: 'student.pending@example.invalid', password })
      .expect(401);
    await http
      .post('/auth/login')
      .send({ login: 'student.disabled@example.invalid', password })
      .expect(401);
    await http.get('/student/today').expect(401);
    // ENROLL-01 applies to pre-existing/demo students too: no implicit course grant.
    const locked = await http.get('/student/today').set('Cookie', student.cookies).expect(200);
    expect(locked.body.empty).toBe(true);
    const course = await prisma.course.findFirstOrThrow();
    const klass = await prisma.teachingClass.findFirstOrThrow();
    const admission = await http
      .post('/admissions/applications')
      .set('Cookie', student.cookies)
      .set('x-csrf-token', student.csrf)
      .send({ courseId: course.publicId })
      .expect(201);
    const admin = await login('admin');
    await http
      .post(`/admissions/applications/${admission.body.publicId}/decision`)
      .set('Cookie', admin.cookies)
      .set('x-csrf-token', admin.csrf)
      .send({ decision: 'APPROVED', classId: klass.publicId })
      .expect(200);
    const today = await http.get('/student/today').set('Cookie', student.cookies).expect(200);
    expect(today.body.empty).toBe(false);
    expect(today.body.entries.length).toBeGreaterThan(0);
    await http.post('/student/exercises/next').set('Cookie', student.cookies).expect(403);
    const exercise = await http
      .post('/student/exercises/next')
      .set('Cookie', student.cookies)
      .set('x-csrf-token', student.csrf)
      .expect(201);
    expect(exercise.body.answerKey).toBeUndefined();
    const stored = await prisma.answerSession.findUniqueOrThrow({
      where: { publicId: exercise.body.sessionId },
    });
    const response = await http
      .post(`/student/exercises/${exercise.body.sessionId}/answers`)
      .set('Cookie', student.cookies)
      .set('x-csrf-token', student.csrf)
      .send({ submissionToken: randomUUID(), answer: stored.answerKey })
      .expect(200);
    expect(response.body.correct).toBe(true);
    expect(response.body.integrityStatus).toBe('COMPLETE');
    expect(await prisma.answerSubmission.count()).toBe(1);
    expect(await prisma.masteryProjection.count()).toBe(1);
    const classes = await http.get('/teacher/classes').set('Cookie', owner.cookies).expect(200);
    expect(classes.body.classes).toHaveLength(1);
    const classId = classes.body.classes[0].classId;
    const roster = await http
      .get(`/teacher/classes/${classId}/roster`)
      .set('Cookie', owner.cookies)
      .expect(200);
    expect(roster.body.students).toHaveLength(2);
    const studentId = roster.body.students.find(
      (s: { login: string }) => s.login === 'student.one@example.invalid',
    ).studentId;
    const assignments = await http
      .get(`/teacher/classes/${classId}/students/${studentId}/assignments`)
      .set('Cookie', owner.cookies)
      .expect(200);
    expect(assignments.body.assignments).toHaveLength(3);
    await http
      .get(`/teacher/classes/${classId}/students/${studentId}/progress`)
      .set('Cookie', owner.cookies)
      .expect(200);
    await http.get(`/teacher/classes/${classId}/roster`).set('Cookie', author.cookies).expect(404);
    await http.get('/teacher/classes').set('Cookie', student.cookies).expect(403);
    const before = await counts();
    await runDemoSeed(options);
    expect(await counts()).toEqual(before);
  }, 30000);
});
