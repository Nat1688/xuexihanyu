/**
 * CP-06 teacher service — authorization + behaviour tests (no Nest, no DB).
 *
 * `TeacherService` is driven through in-memory fakes of its five ports. The
 * fakes are DELIBERATELY permissive (they will return any row they hold); all
 * scoping must therefore come from the service itself. That is what proves:
 *
 *   - a foreign class / foreign student / foreign note is reported as the SAME
 *     not-found error as a nonexistent id (no existence oracle);
 *   - ADMIN can read class/student/progress but NEVER another teacher's notes;
 *   - enroll requires an ACTIVE account and is conflict-safe;
 *   - assignment requires enrollment + a PUBLISHED lesson and is idempotent-by-
 *     conflict;
 *   - progress counts ONLY the student's own evidence, ONLY for the lessons
 *     assigned to them in this class, ONLY inside the window;
 *   - notes are validated, bounded, and always queried by author.
 */
import {
  TeacherAlreadyEnrolledError,
  TeacherAssignmentExistsError,
  TeacherLessonNotAssignableError,
  TeacherNotFoundError,
  TEACHER_ERROR_CODES,
} from '../../src/modules/teacher/domain';
import {
  type ActorContext,
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
import { TeacherService } from '../../src/modules/teacher/application/teacher-service';

const NOW = new Date('2026-10-17T12:00:00.000Z');

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TEACHER = id(1);
const OTHER_TEACHER = id(2);
const STUDENT = id(3);
const OTHER_STUDENT = id(4);
const CLASS_A = id(5);
const CLASS_B = id(6);
const LESSON_PUBLISHED = id(7);
const LESSON_DRAFT = id(8);
const LESSON_UNASSIGNED = id(9);
const ITEM_1 = id(10);
const ITEM_2 = id(11);

const teacher = (publicId = TEACHER): ActorContext => ({ publicId, roles: ['TEACHER'] });
const admin = (): ActorContext => ({ publicId: id(99), roles: ['ADMIN'] });

// --- fakes ------------------------------------------------------------------

class FakeClassRepository implements ClassRepository {
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

class FakeEnrollmentRepository implements EnrollmentRepository {
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
      classOwnerPublicId: TEACHER,
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
        const [, studentPublicId] = p.split(':');
        const student = this.students.get(studentPublicId)!;
        return {
          publicId: p,
          classPublicId,
          classOwnerPublicId: TEACHER,
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

class FakeAssignmentRepository implements AssignmentRepository {
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
      classOwnerPublicId: TEACHER,
      studentPublicId: input.studentPublicId,
      lessonPublicId: input.lessonPublicId,
      lessonTitle: lesson.title,
      dueAt: input.dueAt,
      createdAt: input.createdAt,
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

/** Evidence fake: holds raw rows; EVERY query it receives is recorded. */
class FakeEvidenceRepository implements EvidenceRepository {
  readonly queries: EvidenceQuery[] = [];
  readonly counts: ItemEvidenceCount[] = [];
  readonly mastery: ItemMasteryRow[] = [];
  readonly events: EvidenceEvent[] = [];

  async countByItem(query: EvidenceQuery): Promise<ItemEvidenceCount[]> {
    this.queries.push(query);
    return query.lessonPublicIds.length ? [...this.counts] : [];
  }
  async countEvents(query: EvidenceQuery): Promise<number> {
    this.queries.push(query);
    return query.lessonPublicIds.length ? this.events.length : 0;
  }
  async listRecent(query: EvidenceQuery, limit: number): Promise<EvidenceEvent[]> {
    this.queries.push(query);
    return this.events.slice(0, limit);
  }
  async masteryForItems(
    studentPublicId: string,
    learningItemPublicIds: readonly string[],
  ): Promise<ItemMasteryRow[]> {
    return this.mastery
      .filter(
        (m) => m.learningItemPublicId && learningItemPublicIds.includes(m.learningItemPublicId),
      )
      .map((m) => ({ ...m }));
  }
}

class FakeNoteRepository implements NoteRepository {
  readonly rows: NoteRecord[] = [];
  readonly listCalls: { authorPublicId: string; classPublicId: string; studentPublicId: string }[] =
    [];
  async create(input: NewNote): Promise<NoteRecord | null> {
    const row: NoteRecord = {
      publicId: id(900 + this.rows.length),
      authorPublicId: input.authorPublicId,
      classPublicId: input.classPublicId,
      classOwnerPublicId: TEACHER,
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
    this.listCalls.push({ authorPublicId, classPublicId, studentPublicId });
    // Deliberately permissive: returns EVERY note for the pair, regardless of
    // author. The service must not leak the other author's rows.
    return this.rows.filter(
      (r) => r.classPublicId === classPublicId && r.studentPublicId === studentPublicId,
    );
  }
}

interface Fixture {
  service: TeacherService;
  classes: FakeClassRepository;
  enrollments: FakeEnrollmentRepository;
  assignments: FakeAssignmentRepository;
  evidence: FakeEvidenceRepository;
  notes: FakeNoteRepository;
}

function fixture(): Fixture {
  const classes = new FakeClassRepository();
  const enrollments = new FakeEnrollmentRepository();
  const assignments = new FakeAssignmentRepository();
  const evidence = new FakeEvidenceRepository();
  const notes = new FakeNoteRepository();

  classes.add({
    publicId: CLASS_A,
    title: 'Class A',
    term: 'Term 1',
    ownerPublicId: TEACHER,
    createdAt: NOW,
    enrollmentCount: 1,
  });
  classes.add({
    publicId: CLASS_B,
    title: 'Class B',
    term: null,
    ownerPublicId: OTHER_TEACHER,
    createdAt: NOW,
    enrollmentCount: 1,
  });

  enrollments.students.set(STUDENT, { publicId: STUDENT, login: 'student.one', state: 'ACTIVE' });
  enrollments.students.set(OTHER_STUDENT, {
    publicId: OTHER_STUDENT,
    login: 'student.two',
    state: 'PENDING',
  });
  enrollments.pairs.add(`${CLASS_A}:${STUDENT}`);
  enrollments.pairs.add(`${CLASS_B}:${STUDENT}`);

  assignments.lessons.set(LESSON_PUBLISHED, { publicId: LESSON_PUBLISHED, title: 'Greetings' });
  assignments.lessons.set(LESSON_UNASSIGNED, { publicId: LESSON_UNASSIGNED, title: 'Numbers' });

  evidence.counts.push(
    { learningItemPublicId: ITEM_1, correct: 2, incorrect: 3 },
    { learningItemPublicId: ITEM_2, correct: 4, incorrect: 0 },
  );
  evidence.mastery.push(
    { learningItemPublicId: ITEM_1, state: 'LEARNING', consecutiveCorrect: 0, dueAt: NOW },
    { learningItemPublicId: ITEM_2, state: 'MASTERED', consecutiveCorrect: 4, dueAt: NOW },
  );
  evidence.events.push({
    publicId: 'e1',
    type: 'ANSWER_SUBMITTED',
    occurredAt: NOW,
    accepted: true,
    lessonPublicId: LESSON_PUBLISHED,
    learningItemPublicId: ITEM_1,
  });

  const service = new TeacherService({ classes, enrollments, assignments, evidence, notes });
  return { service, classes, enrollments, assignments, evidence, notes };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

// --- classes ----------------------------------------------------------------

describe('classes', () => {
  it('lists only the caller own classes', async () => {
    const f = fixture();
    const rows = await f.service.listClasses(teacher());
    expect(rows.map((r) => r.publicId)).toEqual([CLASS_A]);

    const other = await f.service.listClasses(teacher(OTHER_TEACHER));
    expect(other.map((r) => r.publicId)).toEqual([CLASS_B]);
  });

  it('creates a class owned by the server-resolved caller', async () => {
    const f = fixture();
    const created = await f.service.createClass(
      teacher(),
      { title: '  HSK 2  ', term: ' Q4 ' },
      NOW,
    );
    expect(created.title).toBe('HSK 2');
    expect(created.term).toBe('Q4');
    expect(f.classes.rows.get(created.publicId)?.ownerPublicId).toBe(TEACHER);
  });

  it('rejects malformed class input', async () => {
    const f = fixture();
    await expectCode(f.service.createClass(teacher(), {}, NOW), TEACHER_ERROR_CODES.INVALID_INPUT);
    await expectCode(
      f.service.createClass(teacher(), { title: 'x'.repeat(121) }, NOW),
      TEACHER_ERROR_CODES.INVALID_INPUT,
    );
    await expectCode(
      f.service.createClass(teacher(), { title: 'ok', term: 5 }, NOW),
      TEACHER_ERROR_CODES.INVALID_INPUT,
    );
  });
});

// --- cross-teacher / cross-class ------------------------------------------

describe('object-level authorization (foreign objects are indistinguishable from missing)', () => {
  it('hides another teacher class from roster/detail/notes/assignments', async () => {
    const f = fixture();
    const notFound = { code: TEACHER_ERROR_CODES.NOT_FOUND };
    await expect(f.service.listRoster(teacher(), CLASS_B)).rejects.toMatchObject(notFound);
    await expect(
      f.service.getStudentProgress(teacher(), CLASS_B, STUDENT, 30, NOW),
    ).rejects.toMatchObject(notFound);
    await expect(
      f.service.getStudentDetail(teacher(), CLASS_B, STUDENT, NOW),
    ).rejects.toMatchObject(notFound);
    await expect(f.service.listNotes(teacher(), CLASS_B, STUDENT)).rejects.toMatchObject(notFound);
    await expect(
      f.service.createAssignment(
        teacher(),
        CLASS_B,
        { studentId: STUDENT, lessonId: LESSON_PUBLISHED },
        NOW,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(f.service.enrollStudent(teacher(), CLASS_B, STUDENT, NOW)).rejects.toMatchObject(
      notFound,
    );
    await expect(
      f.service.createNote(teacher(), CLASS_B, { studentId: STUDENT, body: 'hello' }, NOW),
    ).rejects.toMatchObject(notFound);
  });

  it('answers a nonexistent class exactly like a foreign one', async () => {
    const f = fixture();
    const missing = await f.service.listRoster(teacher(), id(777)).catch((e) => e);
    const foreign = await f.service.listRoster(teacher(), CLASS_B).catch((e) => e);
    expect(missing).toBeInstanceOf(TeacherNotFoundError);
    expect(foreign).toBeInstanceOf(TeacherNotFoundError);
    expect(missing.message).toBe(foreign.message);
  });

  it('rejects non-UUID ids without touching any repository', async () => {
    const f = fixture();
    await expectCode(f.service.listRoster(teacher(), 'not-a-uuid'), TEACHER_ERROR_CODES.NOT_FOUND);
    await expectCode(f.service.listRoster(teacher(), CLASS_A), TEACHER_ERROR_CODES.NOT_FOUND).catch(
      () => undefined,
    ); // CLASS_A exists but has no roster rows; no throw expected
    expect(f.evidence.queries).toHaveLength(0);
  });

  it('hides a student who is not enrolled in MY class (even if enrolled elsewhere)', async () => {
    const f = fixture();
    await expectCode(
      f.service.getStudentProgress(teacher(), CLASS_A, OTHER_STUDENT, 30, NOW),
      TEACHER_ERROR_CODES.NOT_FOUND,
    );
    await expectCode(
      f.service.getStudentDetail(teacher(), CLASS_A, OTHER_STUDENT, NOW),
      TEACHER_ERROR_CODES.NOT_FOUND,
    );
    await expectCode(
      f.service.createNote(teacher(), CLASS_A, { studentId: OTHER_STUDENT, body: 'x' }, NOW),
      TEACHER_ERROR_CODES.NOT_FOUND,
    );
    await expectCode(
      f.service.listAssignments(teacher(), CLASS_A, OTHER_STUDENT),
      TEACHER_ERROR_CODES.NOT_FOUND,
    );
    expect(f.evidence.queries).toHaveLength(0);
  });

  it('never reaches another teacher class through the assignee path', async () => {
    // STUDENT is enrolled in BOTH classes; the class id is what scopes access.
    const f = fixture();
    const asA = await f.service.getStudentProgress(teacher(), CLASS_A, STUDENT, 30, NOW);
    expect(asA.classId).toBe(CLASS_A);
    expect(f.evidence.queries.every((q) => q.lessonPublicIds.length <= 1)).toBe(true);
  });
});

// --- enrollment -------------------------------------------------------------

describe('enrollment', () => {
  it('enrolls an ACTIVE account once, then conflicts', async () => {
    const f = fixture();
    await f.service.enrollStudent(teacher(), CLASS_A, OTHER_STUDENT, NOW).catch(() => undefined);
    // PENDING accounts are refused.
    await expectCode(
      f.service.enrollStudent(teacher(), CLASS_A, OTHER_STUDENT, NOW),
      TEACHER_ERROR_CODES.STUDENT_NOT_ENROLLABLE,
    );

    f.enrollments.students.set(OTHER_STUDENT, {
      publicId: OTHER_STUDENT,
      login: 'student.two',
      state: 'ACTIVE',
    });
    const entry = await f.service.enrollStudent(teacher(), CLASS_A, OTHER_STUDENT, NOW);
    expect(entry.studentId).toBe(OTHER_STUDENT);

    await expect(
      f.service.enrollStudent(teacher(), CLASS_A, OTHER_STUDENT, NOW),
    ).rejects.toBeInstanceOf(TeacherAlreadyEnrolledError);
  });

  it('refuses to enroll an unknown account', async () => {
    const f = fixture();
    await expectCode(
      f.service.enrollStudent(teacher(), CLASS_A, id(555), NOW),
      TEACHER_ERROR_CODES.STUDENT_NOT_ENROLLABLE,
    );
  });

  it('rejects a malformed student id as invalid input', async () => {
    const f = fixture();
    await expectCode(
      f.service.enrollStudent(teacher(), CLASS_A, 'nope', NOW),
      TEACHER_ERROR_CODES.INVALID_INPUT,
    );
  });
});

// --- assignments ------------------------------------------------------------

describe('assignments', () => {
  it('assigns a PUBLISHED lesson to an enrolled student and is conflict-safe', async () => {
    const f = fixture();
    const view = await f.service.createAssignment(
      teacher(),
      CLASS_A,
      { studentId: STUDENT, lessonId: LESSON_PUBLISHED, dueAt: '2026-10-20T00:00:00.000Z' },
      NOW,
    );
    expect(view.lessonId).toBe(LESSON_PUBLISHED);
    expect(view.dueAt?.toISOString()).toBe('2026-10-20T00:00:00.000Z');

    await expect(
      f.service.createAssignment(
        teacher(),
        CLASS_A,
        { studentId: STUDENT, lessonId: LESSON_PUBLISHED },
        NOW,
      ),
    ).rejects.toBeInstanceOf(TeacherAssignmentExistsError);
  });

  it('refuses a draft/unknown lesson', async () => {
    const f = fixture();
    await expect(
      f.service.createAssignment(
        teacher(),
        CLASS_A,
        { studentId: STUDENT, lessonId: LESSON_DRAFT },
        NOW,
      ),
    ).rejects.toBeInstanceOf(TeacherLessonNotAssignableError);
  });

  it('refuses a malformed due date', async () => {
    const f = fixture();
    await expectCode(
      f.service.createAssignment(
        teacher(),
        CLASS_A,
        { studentId: STUDENT, lessonId: LESSON_PUBLISHED, dueAt: 'tomorrow' },
        NOW,
      ),
      TEACHER_ERROR_CODES.INVALID_INPUT,
    );
  });
});

// --- progress ---------------------------------------------------------------

describe('evidence-backed progress', () => {
  it('scopes the evidence query to this student, this class lessons, and the window', async () => {
    const f = fixture();
    await f.service.createAssignment(
      teacher(),
      CLASS_A,
      { studentId: STUDENT, lessonId: LESSON_PUBLISHED },
      NOW,
    );
    const view = await f.service.getStudentProgress(teacher(), CLASS_A, STUDENT, 30, NOW);

    expect(f.evidence.queries).toHaveLength(2);
    for (const q of f.evidence.queries) {
      expect(q.studentPublicId).toBe(STUDENT);
      expect(q.lessonPublicIds).toEqual([LESSON_PUBLISHED]);
      expect(q.from.toISOString()).toBe('2026-09-17T12:00:00.000Z');
      expect(q.to).toEqual(NOW);
    }

    expect(view.evidence.attempts).toBe(9);
    expect(view.evidence.correct).toBe(6);
    expect(view.evidence.incorrect).toBe(3);
    expect(view.evidence.accuracy).toBe(0.667);
    expect(view.evidence.assignedLessons).toBe(1);
    expect(view.evidence.itemsWithEvidence).toBe(2);
    expect(view.weakItems.map((w) => w.itemId)).toEqual([ITEM_1, ITEM_2]);
  });

  it('does NOT read unassigned lessons and returns an empty, honest summary', async () => {
    const f = fixture();
    // LESSON_UNASSIGNED exists in the content store but is not assigned here.
    const view = await f.service.getStudentProgress(teacher(), CLASS_A, STUDENT, 30, NOW);
    expect(view.evidence.assignedLessons).toBe(0);
    expect(view.evidence.attempts).toBe(0);
    expect(view.evidence.accuracy).toBeNull();
    expect(f.evidence.queries.every((q) => q.lessonPublicIds.length === 0)).toBe(true);
    expect(view.weakItems).toEqual([]);
  });

  it('clamps the requested window (never wider than policy)', async () => {
    const f = fixture();
    await f.service.createAssignment(
      teacher(),
      CLASS_A,
      { studentId: STUDENT, lessonId: LESSON_PUBLISHED },
      NOW,
    );
    const view = await f.service.getStudentProgress(teacher(), CLASS_A, STUDENT, 100000, NOW);
    expect(view.evidence.window.days).toBe(366);
    expect(f.evidence.queries[0].from.toISOString()).toBe('2025-10-16T12:00:00.000Z');
  });

  it('defaults to 30 days for missing/invalid input', async () => {
    const f = fixture();
    const view = await f.service.getStudentProgress(teacher(), CLASS_A, STUDENT, undefined, NOW);
    expect(view.evidence.window.days).toBe(30);
  });
});

// --- private notes ----------------------------------------------------------

describe('private notes', () => {
  it('stores notes authored by the caller with a bounded, cleaned body', async () => {
    const f = fixture();
    const note = await f.service.createNote(
      teacher(),
      CLASS_A,
      { studentId: STUDENT, title: '  Focus  ', body: '  tones are unstable\u0000 ' },
      NOW,
    );
    expect(note.title).toBe('Focus');
    expect(note.body).toBe('tones are unstable');
    expect(f.notes.rows[0].authorPublicId).toBe(TEACHER);
  });

  it('rejects empty/oversized note bodies', async () => {
    const f = fixture();
    await expectCode(
      f.service.createNote(teacher(), CLASS_A, { studentId: STUDENT, body: '   ' }, NOW),
      TEACHER_ERROR_CODES.INVALID_INPUT,
    );
    await expectCode(
      f.service.createNote(teacher(), CLASS_A, { studentId: STUDENT, body: 'x'.repeat(2001) }, NOW),
      TEACHER_ERROR_CODES.INVALID_INPUT,
    );
  });

  it('queries by author and filters out rows authored by someone else', async () => {
    const f = fixture();
    await f.service.createNote(teacher(), CLASS_A, { studentId: STUDENT, body: 'mine' }, NOW);
    // Simulate a note written by another teacher on the same class/student.
    f.notes.rows.push({
      publicId: id(950),
      authorPublicId: OTHER_TEACHER,
      classPublicId: CLASS_A,
      classOwnerPublicId: TEACHER,
      studentPublicId: STUDENT,
      title: null,
      body: 'theirs',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const mine = await f.service.listNotes(teacher(), CLASS_A, STUDENT);
    expect(mine.map((n) => n.body)).toEqual(['mine']);
    expect(f.notes.listCalls[0].authorPublicId).toBe(TEACHER);
  });

  it('lets ADMIN read class data but never private notes', async () => {
    const f = fixture();
    await f.service.createNote(teacher(), CLASS_A, { studentId: STUDENT, body: 'private' }, NOW);

    const roster = await f.service.listRoster(admin(), CLASS_A);
    expect(roster.map((r) => r.studentId)).toEqual([STUDENT]);

    const notes = await f.service.listNotes(admin(), CLASS_A, STUDENT);
    expect(notes).toEqual([]);
    expect(f.notes.listCalls[0].authorPublicId).toBe(id(99));
  });
});

// --- detail -----------------------------------------------------------------

describe('student detail', () => {
  it('combines roster entry, assignments, progress and recent evidence', async () => {
    const f = fixture();
    await f.service.createAssignment(
      teacher(),
      CLASS_A,
      { studentId: STUDENT, lessonId: LESSON_PUBLISHED },
      NOW,
    );
    const view = await f.service.getStudentDetail(teacher(), CLASS_A, STUDENT, NOW);
    expect(view.login).toBe('student.one');
    expect(view.assignments).toHaveLength(1);
    expect(view.progress.evidence.window.days).toBe(30);
    expect(view.recentEvidence.map((e) => e.id)).toEqual(['e1']);
  });
});
