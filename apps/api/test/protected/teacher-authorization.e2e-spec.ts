/**
 * CP-06 teacher surface — HTTP-level authorization tests (no DB).
 *
 * Boots the REAL `TeacherModule` through Nest with:
 *   - in-memory fakes for the five CP-06 ports (permission-maximal: the fakes
 *     return whatever they hold, so scoping must come from the app),
 *   - a fake `AuthService` that maps a test cookie to a synthetic principal.
 *
 * `AuthGuard` and `RoleGuard` are NOT faked — they are the real classes, so
 * this proves the actual guard chain:
 *   - 401 for no/unknown session;
 *   - 403 for STUDENT (RoleGuard, uniform auth body);
 *   - 200/201 for TEACHER;
 *   - CSRF double-submit is required on every mutating POST;
 *   - cross-teacher / cross-class reads and writes are 404 with a body that is
 *     byte-identical to a nonexistent id (no existence disclosure);
 *   - ADMIN reads class data (200) but sees ZERO private notes of a teacher;
 *   - the acting teacher is always the session principal, never a body value;
 *   - response bodies are bounded and contain no surrogate ids.
 */
import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthService } from '../../src/modules/identity/application/auth-service';
import { hashCsrfToken, newCsrfToken } from '../../src/modules/identity/domain/csrf';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '../../src/modules/identity/application/cookie-policy';
import { AuthExceptionFilter } from '../../src/modules/identity/http/auth-exception.filter';
import { AuthGuard } from '../../src/modules/identity/http/auth.guard';
import { RoleGuard } from '../../src/modules/identity/http/role.guard';
import { TeacherService } from '../../src/modules/teacher/application/teacher-service';
import {
  type AssignmentRecord,
  type AssignmentRepository,
  type AssignableLesson,
  type ClassRecord,
  type ClassRepository,
  type EnrollmentRecord,
  type EnrollmentRepository,
  type EvidenceEvent,
  type EvidenceQuery,
  type EvidenceRepository,
  type ItemEvidenceCount,
  type ItemMasteryRow,
  type NewAssignment,
  type NewClass,
  type NewNote,
  type NoteRecord,
  type NoteRepository,
  type StudentLookup,
} from '../../src/modules/teacher/application/teacher-ports';
import { TeacherController } from '../../src/modules/teacher/http/teacher.controller';
import {
  TEACHER_ASSIGNMENT_REPOSITORY,
  TEACHER_CLASS_REPOSITORY,
  TEACHER_ENROLLMENT_REPOSITORY,
  TEACHER_EVIDENCE_REPOSITORY,
  TEACHER_NOTE_REPOSITORY,
} from '../../src/modules/teacher/teacher.tokens';

const NOW_ISO = '2026-10-17T12:00:00.000Z';
const NOW = new Date(NOW_ISO);

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const T1 = id(1); // teacher one (session cookie `t1`)
const T2 = id(2); // teacher two (session cookie `t2`)
const ADMIN = id(3); // admin (session cookie `adm`)
const STUDENT = id(4);
const CLASS_T1 = id(10);
const CLASS_T2 = id(11);
const LESSON_PUBLISHED = id(20);
const ITEM_1 = id(30);
const ITEM_2 = id(31);

const CSRF = newCsrfToken(); // shape-valid (24-byte base64url)
const CSRF_HASH = hashCsrfToken(CSRF);

const sessions: Record<string, { publicId: string; roles: string[] }> = {
  t1: { publicId: T1, roles: ['TEACHER'] },
  t2: { publicId: T2, roles: ['TEACHER'] },
  adm: { publicId: ADMIN, roles: ['ADMIN'] },
  stu: { publicId: STUDENT, roles: ['STUDENT'] },
};

class FakeAuthService {
  async resolveSession(token: string | undefined) {
    if (!token || !sessions[token]) return null;
    const principal = sessions[token];
    return { principal, csrfHash: CSRF_HASH, sessionId: `sess-${token}` };
  }
}

class FakeClasses implements ClassRepository {
  async update(publicId: string, title: string, term: string | null) {
    const row = (await this.findByPublicId(publicId))!;
    Object.assign(row, { title, term });
    return row;
  }

  async overview() {
    return {
      courses: 0,
      classes: 0,
      students: 0,
      lessons: 0,
      assignments: 0,
      completed: 0,
      pending: 0,
    };
  }

  readonly rows = new Map<string, ClassRecord>();
  async create(input: NewClass): Promise<ClassRecord | null> {
    const publicId = id(100 + this.rows.size);
    const row: ClassRecord = {
      publicId,
      title: input.title,
      term: input.term,
      ownerPublicId: input.ownerPublicId,
      createdAt: NOW,
      enrollmentCount: 0,
    };
    this.rows.set(publicId, row);
    return row;
  }
  async listOwned(ownerPublicId: string): Promise<ClassRecord[]> {
    return [...this.rows.values()].filter((r) => r.ownerPublicId === ownerPublicId);
  }
  async findByPublicId(publicId: string): Promise<ClassRecord | null> {
    return this.rows.get(publicId) ?? null;
  }
  add(row: ClassRecord): void {
    this.rows.set(row.publicId, row);
  }
}

class FakeEnrollments implements EnrollmentRepository {
  readonly students = new Map<string, StudentLookup>();
  readonly pairs = new Set<string>();
  async findStudent(publicId: string): Promise<StudentLookup | null> {
    return this.students.get(publicId) ?? null;
  }
  async exists(classPublicId: string, studentPublicId: string): Promise<boolean> {
    return this.pairs.has(`${classPublicId}:${studentPublicId}`);
  }
  async enroll(
    classPublicId: string,
    studentPublicId: string,
    at: Date,
  ): Promise<EnrollmentRecord | null> {
    if (this.pairs.has(`${classPublicId}:${studentPublicId}`)) return null;
    this.pairs.add(`${classPublicId}:${studentPublicId}`);
    const student = this.students.get(studentPublicId)!;
    return {
      publicId: `${classPublicId}:${studentPublicId}`,
      classPublicId,
      classOwnerPublicId: T1,
      studentPublicId,
      studentLogin: student.login,
      studentDisplayName: null,
      enrolledAt: at,
    };
  }
  async listByClass(classPublicId: string, limit: number): Promise<EnrollmentRecord[]> {
    return [...this.pairs]
      .filter((p) => p.startsWith(`${classPublicId}:`))
      .slice(0, limit)
      .map((p) => {
        const [classId, studentPublicId] = p.split(':');
        const student = this.students.get(studentPublicId)!;
        return {
          publicId: p,
          classPublicId: classId,
          classOwnerPublicId: T1,
          studentPublicId,
          studentLogin: student.login,
          studentDisplayName: null,
          enrolledAt: NOW,
        };
      });
  }
  async isEnrolled(classPublicId: string, studentPublicId: string): Promise<boolean> {
    return this.pairs.has(`${classPublicId}:${studentPublicId}`);
  }
}

class FakeAssignments implements AssignmentRepository {
  readonly lessons = new Map<string, AssignableLesson>();
  readonly rows: AssignmentRecord[] = [];
  async findPublishedLesson(lessonPublicId: string): Promise<AssignableLesson | null> {
    return this.lessons.get(lessonPublicId) ?? null;
  }
  async exists(
    classPublicId: string,
    studentPublicId: string,
    lessonPublicId: string,
  ): Promise<boolean> {
    return this.rows.some(
      (r) =>
        r.classPublicId === classPublicId &&
        r.studentPublicId === studentPublicId &&
        r.lessonPublicId === lessonPublicId,
    );
  }
  async create(input: NewAssignment): Promise<AssignmentRecord | null> {
    if (await this.exists(input.classPublicId, input.studentPublicId, input.lessonPublicId))
      return null;
    const lesson = this.lessons.get(input.lessonPublicId)!;
    const row: AssignmentRecord = {
      publicId: id(500 + this.rows.length),
      classPublicId: input.classPublicId,
      classOwnerPublicId: T1,
      studentPublicId: input.studentPublicId,
      lessonPublicId: input.lessonPublicId,
      lessonTitle: lesson.title,
      dueAt: input.dueAt,
      createdAt: NOW,
    };
    this.rows.push(row);
    return row;
  }
  async listForStudent(
    classPublicId: string,
    studentPublicId: string,
  ): Promise<AssignmentRecord[]> {
    return this.rows.filter(
      (r) => r.classPublicId === classPublicId && r.studentPublicId === studentPublicId,
    );
  }
}

class FakeEvidence implements EvidenceRepository {
  readonly queries: EvidenceQuery[] = [];
  async countByItem(query: EvidenceQuery): Promise<ItemEvidenceCount[]> {
    this.queries.push(query);
    if (query.lessonPublicIds.length === 0) return [];
    return [
      { learningItemPublicId: ITEM_1, correct: 1, incorrect: 3 },
      { learningItemPublicId: ITEM_2, correct: 5, incorrect: 0 },
    ];
  }
  async countEvents(query: EvidenceQuery): Promise<number> {
    this.queries.push(query);
    return query.lessonPublicIds.length === 0 ? 0 : 9;
  }
  async listRecent(): Promise<EvidenceEvent[]> {
    return [
      {
        publicId: 'evt-1',
        type: 'ANSWER_SUBMITTED',
        occurredAt: NOW,
        accepted: false,
        lessonPublicId: LESSON_PUBLISHED,
        learningItemPublicId: ITEM_1,
      },
    ];
  }
  async masteryForItems(
    _studentPublicId: string,
    learningItemPublicIds: readonly string[],
  ): Promise<ItemMasteryRow[]> {
    return learningItemPublicIds.map((item) => ({
      learningItemPublicId: item,
      state: item === ITEM_1 ? 'LEARNING' : 'MASTERED',
      consecutiveCorrect: 0,
      dueAt: NOW,
    }));
  }
}

class FakeNotes implements NoteRepository {
  readonly rows: NoteRecord[] = [];
  async create(input: NewNote): Promise<NoteRecord | null> {
    const row: NoteRecord = {
      publicId: id(900 + this.rows.length),
      authorPublicId: input.authorPublicId,
      classPublicId: input.classPublicId,
      classOwnerPublicId: T1,
      studentPublicId: input.studentPublicId,
      title: input.title,
      body: input.body,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.rows.push(row);
    return row;
  }
  async listAuthored(
    authorPublicId: string,
    classPublicId: string,
    studentPublicId: string,
  ): Promise<NoteRecord[]> {
    // Permission-maximal: ignores the author argument on purpose.
    return this.rows.filter(
      (r) => r.classPublicId === classPublicId && r.studentPublicId === studentPublicId,
    );
  }
}

describe('CP-06 teacher HTTP authorization', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let classes: FakeClasses;
  let enrollments: FakeEnrollments;
  let assignments: FakeAssignments;
  let evidence: FakeEvidence;
  let notes: FakeNotes;

  beforeAll(async () => {
    classes = new FakeClasses();
    enrollments = new FakeEnrollments();
    assignments = new FakeAssignments();
    evidence = new FakeEvidence();
    notes = new FakeNotes();

    const factoryDeps = new Map<symbol, unknown>([
      [TEACHER_CLASS_REPOSITORY, classes],
      [TEACHER_ENROLLMENT_REPOSITORY, enrollments],
      [TEACHER_ASSIGNMENT_REPOSITORY, assignments],
      [TEACHER_EVIDENCE_REPOSITORY, evidence],
      [TEACHER_NOTE_REPOSITORY, notes],
    ]);

    const moduleRef = await Test.createTestingModule({
      controllers: [TeacherController],
      providers: [
        { provide: AuthService, useClass: FakeAuthService },
        // The real APP_FILTER from IdentityModule: maps guard-thrown auth errors
        // (401/403/CSRF) into the ADR-005 envelope, proving the shipped chain.
        { provide: APP_FILTER, useClass: AuthExceptionFilter },
        AuthGuard,
        RoleGuard,
        {
          provide: TeacherService,
          inject: [
            TEACHER_CLASS_REPOSITORY,
            TEACHER_ENROLLMENT_REPOSITORY,
            TEACHER_ASSIGNMENT_REPOSITORY,
            TEACHER_EVIDENCE_REPOSITORY,
            TEACHER_NOTE_REPOSITORY,
          ],
          useFactory: (
            c: ClassRepository,
            e: EnrollmentRepository,
            a: AssignmentRepository,
            v: EvidenceRepository,
            n: NoteRepository,
          ) =>
            new TeacherService({
              classes: c,
              enrollments: e,
              assignments: a,
              evidence: v,
              notes: n,
            }),
        },
        ...[...factoryDeps].map(([token, value]) => ({ provide: token, useValue: value })),
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    agent = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  function session(token: string): { cookie: string[]; csrf: Record<string, string> } {
    return {
      cookie: [`${SESSION_COOKIE_NAME}=${token}`, `${CSRF_COOKIE_NAME}=${CSRF}`],
      csrf: { 'x-csrf-token': CSRF },
    };
  }

  beforeEach(() => {
    classes.rows.clear();
    enrollments.pairs.clear();
    enrollments.students.clear();
    assignments.lessons.clear();
    assignments.rows.length = 0;
    evidence.queries.length = 0;
    notes.rows.length = 0;

    classes.add({
      publicId: CLASS_T1,
      title: 'T1 class',
      term: null,
      ownerPublicId: T1,
      createdAt: NOW,
      enrollmentCount: 1,
    });
    classes.add({
      publicId: CLASS_T2,
      title: 'T2 class',
      term: null,
      ownerPublicId: T2,
      createdAt: NOW,
      enrollmentCount: 1,
    });
    enrollments.students.set(STUDENT, { publicId: STUDENT, login: 'student.one', state: 'ACTIVE' });
    enrollments.pairs.add(`${CLASS_T1}:${STUDENT}`);
    enrollments.pairs.add(`${CLASS_T2}:${STUDENT}`);
    assignments.lessons.set(LESSON_PUBLISHED, { publicId: LESSON_PUBLISHED, title: 'Greetings' });
  });

  // --- authentication & roles ---------------------------------------------

  it('401s without a session', async () => {
    const res = await agent.get('/teacher/classes');
    expect(res.status).toBe(401);
  });

  it('403s a STUDENT on every teacher route', async () => {
    const s = session('stu');
    const res = await agent.get('/teacher/classes').set('Cookie', s.cookie);
    expect(res.status).toBe(403);
    const write = await agent
      .post('/teacher/classes')
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ title: 'x' });
    expect(write.status).toBe(403);
  });

  it('lets a TEACHER list only their own classes', async () => {
    const s = session('t1');
    const res = await agent.get('/teacher/classes').set('Cookie', s.cookie);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.classes[0].classId).toBe(CLASS_T1);
    expect(res.body.classes[0]).not.toHaveProperty('ownerPublicId');
  });

  // --- CSRF ---------------------------------------------------------------

  it('requires the CSRF double-submit on every mutating POST', async () => {
    const s = session('t1');
    const noHeader = await agent
      .post('/teacher/classes')
      .set('Cookie', s.cookie)
      .send({ title: 'Term list' });
    expect(noHeader.status).toBeGreaterThanOrEqual(400);
    expect(noHeader.status).toBeLessThan(500);

    const wrong = await agent
      .post('/teacher/classes')
      .set('Cookie', s.cookie)
      .set('x-csrf-token', 'not-the-token')
      .send({ title: 'Term list' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.status).toBeLessThan(500);

    const ok = await agent
      .post('/teacher/classes')
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ title: 'Term list' });
    expect(ok.status).toBe(201);
    expect(ok.body.title).toBe('Term list');
  });

  // --- object-level authorization over HTTP -------------------------------

  it('404s another teacher class with the SAME body as a nonexistent class', async () => {
    const s = session('t1');
    const foreign = await agent.get(`/teacher/classes/${CLASS_T2}/roster`).set('Cookie', s.cookie);
    const missing = await agent.get(`/teacher/classes/${id(999)}/roster`).set('Cookie', s.cookie);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.error.code).toBe('TEACHER_NOT_FOUND');
  });

  it('404s another teacher class on every scoped route (read and write)', async () => {
    const s = session('t1');
    const paths = [
      `/teacher/classes/${CLASS_T2}/roster`,
      `/teacher/classes/${CLASS_T2}/students/${STUDENT}`,
      `/teacher/classes/${CLASS_T2}/students/${STUDENT}/progress`,
      `/teacher/classes/${CLASS_T2}/students/${STUDENT}/assignments`,
      `/teacher/classes/${CLASS_T2}/students/${STUDENT}/notes`,
    ];
    for (const path of paths) {
      const res = await agent.get(path).set('Cookie', s.cookie);
      expect([path, res.status]).toEqual([path, 404]);
    }

    const enroll = await agent
      .post(`/teacher/classes/${CLASS_T2}/roster`)
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ studentId: STUDENT });
    expect(enroll.status).toBe(404);

    const assign = await agent
      .post(`/teacher/classes/${CLASS_T2}/assignments`)
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ studentId: STUDENT, lessonId: LESSON_PUBLISHED });
    expect(assign.status).toBe(404);

    const note = await agent
      .post(`/teacher/classes/${CLASS_T2}/students/${STUDENT}/notes`)
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ body: 'should not exist' });
    expect(note.status).toBe(404);
    expect(notes.rows).toHaveLength(0);
    expect(evidence.queries).toHaveLength(0);
  });

  it('ignores a body-supplied author/actor and binds writes to the session', async () => {
    const s = session('t1');
    const res = await agent
      .post(`/teacher/classes/${CLASS_T1}/students/${STUDENT}/notes`)
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ body: 'Private note', authorPublicId: T2, teacherId: T2 });
    expect(res.status).toBe(201);
    expect(notes.rows[0].authorPublicId).toBe(T1);
    expect(res.body).not.toHaveProperty('authorPublicId');
    expect(res.body).not.toHaveProperty('authorId');
  });

  it('serves evidence-backed progress from the scoped window only', async () => {
    const s = session('t1');
    await agent
      .post(`/teacher/classes/${CLASS_T1}/assignments`)
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ studentId: STUDENT, lessonId: LESSON_PUBLISHED });

    const res = await agent
      .get(`/teacher/classes/${CLASS_T1}/students/${STUDENT}/progress?days=7`)
      .set('Cookie', s.cookie);
    expect(res.status).toBe(200);
    expect(res.body.evidence.window.days).toBe(7);
    expect(res.body.evidence.attempts).toBe(9);
    expect(res.body.weakItems[0].itemId).toBe(ITEM_1);
    for (const q of evidence.queries) {
      expect(q.studentPublicId).toBe(STUDENT);
      expect(q.lessonPublicIds).toEqual([LESSON_PUBLISHED]);
    }
  });

  // --- ADMIN boundary -----------------------------------------------------

  it('lets ADMIN read class data but never another teacher private notes', async () => {
    const s = session('adm');
    const roster = await agent.get(`/teacher/classes/${CLASS_T1}/roster`).set('Cookie', s.cookie);
    expect(roster.status).toBe(200);
    expect(roster.body.students.map((x: { studentId: string }) => x.studentId)).toEqual([STUDENT]);

    // Seed a note authored by T1.
    const t1 = session('t1');
    await agent
      .post(`/teacher/classes/${CLASS_T1}/students/${STUDENT}/notes`)
      .set('Cookie', t1.cookie)
      .set(t1.csrf)
      .send({ body: 'Teacher one private' });

    const adminNotes = await agent
      .get(`/teacher/classes/${CLASS_T1}/students/${STUDENT}/notes`)
      .set('Cookie', s.cookie);
    expect(adminNotes.status).toBe(200);
    expect(adminNotes.body.notes).toEqual([]);

    const own = await agent
      .get(`/teacher/classes/${CLASS_T1}/students/${STUDENT}/notes`)
      .set('Cookie', t1.cookie);
    expect(own.body.notes).toHaveLength(1);
    expect(own.body.notes[0].body).toBe('Teacher one private');
  });

  // --- bounded payloads ---------------------------------------------------

  it('bounds note bodies and returns a safe 400', async () => {
    const s = session('t1');
    const res = await agent
      .post(`/teacher/classes/${CLASS_T1}/students/${STUDENT}/notes`)
      .set('Cookie', s.cookie)
      .set(s.csrf)
      .send({ body: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TEACHER_INVALID_INPUT');
    expect(res.body.error.message).toBe('Invalid request');
  });
});
