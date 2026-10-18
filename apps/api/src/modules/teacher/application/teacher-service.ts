/**
 * Teacher MVP application service (CP-06).
 *
 * Composes the narrow CP-06 ports into the teacher slice:
 *
 *   classes -> enrollments -> assignments -> evidence-backed progress ->
 *   weak items -> private notes
 *
 * Authorization invariants (the reason this surface exists):
 *   1. The acting teacher is ALWAYS taken from the server-resolved session
 *      (`ActorContext.publicId`), never from a URL/body id.
 *   2. Every class-scoped operation first loads the class and checks
 *      `canReadClass` (owner, or bounded ADMIN). A foreign class is reported
 *      as {@link TeacherNotFoundError} — the same answer as a random id, so
 *      the routes cannot be used as an existence oracle.
 *   3. Assignments/notes require an EXISTING enrollment of the target student
 *      in that class; otherwise not-found. A teacher can never reach a student
 *      outside their own roster.
 *   4. Private notes are author-only. ADMIN does not see them.
 *   5. Progress is EVIDENCE-BACKED: counts come from CP-03 learning events
 *      scoped to the student's assigned lessons; mastery state is CP-04's
 *      derived projection. Nothing here grades, scores or predicts.
 *
 * Forbidden here (contract): AI summaries/recommendations, high-stakes
 * grading, proctoring, global student search, notifications, analytics
 * dashboards, social features.
 */
import {
  boundedWindow as boundedWindowOr,
  canReadClass,
  evidenceWindow,
  isPublicId,
  isTeacherOrAdmin,
  MAX_CLASSES,
  MAX_EVIDENCE_EVENTS,
  MAX_ROSTER,
  MAX_WEAK_ITEMS,
  normaliseNoteTitle,
  rankWeakItems,
  validateNoteBody,
  type WeakRankInput,
} from '../domain/teacher-policy';
import {
  TeacherAlreadyEnrolledError,
  TeacherAssignmentExistsError,
  TeacherError,
  TeacherInvalidInputError,
  TeacherLessonNotAssignableError,
  TeacherNotFoundError,
  TeacherStudentNotEnrollableError,
} from '../domain/teacher-errors';
import {
  type ActorContext,
  type AssignmentRepository,
  type ClassRecord,
  type ClassRepository,
  type EnrollmentRepository,
  type EvidenceQuery,
  type EvidenceRepository,
  type NoteRepository,
  type NoteRecord,
} from './teacher-ports';

/** Hard bounds on teacher-supplied class fields. */
export const CLASS_TITLE_MAX = 120;
export const CLASS_TERM_MAX = 40;

export interface TeacherServiceDeps {
  readonly classes: ClassRepository;
  readonly enrollments: EnrollmentRepository;
  readonly assignments: AssignmentRepository;
  readonly evidence: EvidenceRepository;
  readonly notes: NoteRepository;
}

// --- views ------------------------------------------------------------------

export interface ClassView {
  readonly publicId: string;
  readonly title: string;
  readonly term: string | null;
  readonly createdAt: Date;
  readonly enrollmentCount: number;
}

export interface RosterEntryView {
  readonly studentId: string;
  readonly login: string;
  readonly displayName: string | null;
  readonly enrolledAt: Date;
}

export interface AssignmentView {
  readonly id: string;
  readonly studentId: string;
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly dueAt: Date | null;
  readonly createdAt: Date;
}

export interface EvidenceSummaryView {
  readonly window: { readonly from: Date; readonly to: Date; readonly days: number };
  readonly totalEvents: number;
  readonly attempts: number;
  readonly correct: number;
  readonly incorrect: number;
  /** Correct / attempts, rounded to 3 decimals; null when no attempts. */
  readonly accuracy: number | null;
  readonly assignedLessons: number;
  readonly itemsWithEvidence: number;
}

export interface WeakItemView {
  readonly itemId: string;
  readonly state: string;
  readonly correct: number;
  readonly incorrect: number;
  readonly dueAt: Date | null;
}

export interface StudentProgressView {
  readonly studentId: string;
  readonly classId: string;
  readonly evidence: EvidenceSummaryView;
  readonly weakItems: readonly WeakItemView[];
}

export interface EvidenceEventView {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly accepted: boolean | null;
  readonly lessonId: string | null;
  readonly itemId: string | null;
}

export interface StudentDetailView {
  readonly studentId: string;
  readonly login: string;
  readonly displayName: string | null;
  readonly assignments: readonly AssignmentView[];
  readonly progress: StudentProgressView;
  readonly recentEvidence: readonly EvidenceEventView[];
}

export interface NoteView {
  readonly id: string;
  readonly studentId: string;
  readonly title: string | null;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Inputs that arrive straight from HTTP and must be validated here. */
export interface CreateClassInput {
  readonly title?: unknown;
  readonly term?: unknown;
}

export interface CreateAssignmentInput {
  readonly studentId?: unknown;
  readonly lessonId?: unknown;
  readonly dueAt?: unknown;
}

export interface CreateNoteInput {
  readonly studentId?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
}

// --- service ----------------------------------------------------------------

export class TeacherService {
  constructor(private readonly deps: TeacherServiceDeps) {}

  // --- classes -------------------------------------------------------------

  /** List ONLY the caller's own classes (ADMIN does not get a cross list). */
  async listClasses(actor: ActorContext): Promise<ClassView[]> {
    this.assertTeacher(actor);
    const rows = await this.deps.classes.listOwned(actor.publicId);
    return rows.slice(0, MAX_CLASSES).map((row) => this.toClassView(row));
  }

  async createClass(actor: ActorContext, input: CreateClassInput, now: Date): Promise<ClassView> {
    this.assertTeacher(actor);
    const title = this.requireTitle(input.title);
    const term = this.optionalTerm(input.term);

    const created = await this.deps.classes.create({
      ownerPublicId: actor.publicId,
      title,
      term,
    });
    if (!created) throw new TeacherError('TEACHER_CONFLICT', 'The class could not be created');
    void now;
    return this.toClassView(created);
  }

  // --- enrollment / roster -------------------------------------------------

  async listRoster(actor: ActorContext, classId: unknown): Promise<RosterEntryView[]> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const rows = await this.deps.enrollments.listByClass(klass.publicId, MAX_ROSTER);
    return rows.map((row) => ({
      studentId: row.studentPublicId,
      login: row.studentLogin,
      displayName: row.studentDisplayName,
      enrolledAt: row.enrolledAt,
    }));
  }

  /**
   * Enroll an existing account into the caller's class. Only ACTIVE accounts
   * can be enrolled (a PENDING/DISABLED account is rejected with a safe code).
   */
  async enrollStudent(
    actor: ActorContext,
    classId: unknown,
    studentId: unknown,
    now: Date,
  ): Promise<RosterEntryView> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const target = this.requireId(studentId, 'studentId');

    const student = await this.deps.enrollments.findStudent(target);
    if (!student) throw new TeacherStudentNotEnrollableError();
    if (student.state !== 'ACTIVE') throw new TeacherStudentNotEnrollableError();

    if (await this.deps.enrollments.exists(klass.publicId, student.publicId)) {
      throw new TeacherAlreadyEnrolledError();
    }
    const created = await this.deps.enrollments.enroll(klass.publicId, student.publicId, now);
    if (!created) throw new TeacherAlreadyEnrolledError();
    return {
      studentId: created.studentPublicId,
      login: created.studentLogin,
      displayName: created.studentDisplayName,
      enrolledAt: created.enrolledAt,
    };
  }

  // --- assignments ---------------------------------------------------------

  async createAssignment(
    actor: ActorContext,
    classId: unknown,
    input: CreateAssignmentInput,
    now: Date,
  ): Promise<AssignmentView> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const studentId = this.requireId(input.studentId, 'studentId');
    const lessonId = this.requireId(input.lessonId, 'lessonId');
    const dueAt = this.optionalDueAt(input.dueAt);

    await this.requireEnrolled(klass, studentId);

    const lesson = await this.deps.assignments.findPublishedLesson(lessonId);
    if (!lesson) throw new TeacherLessonNotAssignableError();

    if (await this.deps.assignments.exists(klass.publicId, studentId, lesson.publicId)) {
      throw new TeacherAssignmentExistsError();
    }
    const created = await this.deps.assignments.create({
      classPublicId: klass.publicId,
      studentPublicId: studentId,
      lessonPublicId: lesson.publicId,
      dueAt,
      createdAt: now,
    });
    if (!created) throw new TeacherAssignmentExistsError();
    return this.toAssignmentView(created);
  }

  async listAssignments(
    actor: ActorContext,
    classId: unknown,
    studentId: unknown,
  ): Promise<AssignmentView[]> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const target = this.requireId(studentId, 'studentId');
    await this.requireEnrolled(klass, target);
    const rows = await this.deps.assignments.listForStudent(klass.publicId, target);
    return rows.map((row) => this.toAssignmentView(row));
  }

  // --- progress (evidence-backed) -----------------------------------------

  /**
   * Progress for ONE enrolled student in ONE visible class. `windowDays`
   * (default 30, max 366) bounds the evidence read; every count comes from
   * the student's CP-03 events within the lessons ASSIGNED to them in this
   * class, and mastery state comes from CP-04.
   */
  async getStudentProgress(
    actor: ActorContext,
    classId: unknown,
    studentId: unknown,
    windowDays: unknown,
    now: Date,
  ): Promise<StudentProgressView> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const target = this.requireId(studentId, 'studentId');
    await this.requireEnrolled(klass, target);

    const window = evidenceWindow(now, boundedWindowOr(windowDays));
    const assignments = await this.deps.assignments.listForStudent(klass.publicId, target);
    const lessonIds = [...new Set(assignments.map((a) => a.lessonPublicId))];

    const query: EvidenceQuery = {
      studentPublicId: target,
      lessonPublicIds: lessonIds,
      from: window.from,
      to: window.to,
    };

    const [byItem, totalEvents] = await Promise.all([
      this.deps.evidence.countByItem(query),
      this.deps.evidence.countEvents(query),
    ]);

    const itemIds = byItem.map((row) => row.learningItemPublicId);
    const mastery = await this.deps.evidence.masteryForItems(target, itemIds);
    const masteryByItem = new Map(mastery.map((m) => [m.learningItemPublicId, m]));

    const correct = byItem.reduce((sum, row) => sum + row.correct, 0);
    const incorrect = byItem.reduce((sum, row) => sum + row.incorrect, 0);
    const attempts = correct + incorrect;

    const weakInputs: WeakRankInput[] = byItem.map((row) => {
      const m = masteryByItem.get(row.learningItemPublicId);
      return {
        learningItemPublicId: row.learningItemPublicId,
        state: m?.state ?? 'NEW',
        consecutiveCorrect: m?.consecutiveCorrect ?? 0,
        correctInWindow: row.correct,
        incorrectInWindow: row.incorrect,
        dueAt: m?.dueAt ?? null,
      };
    });
    const weak = rankWeakItems(weakInputs, now, MAX_WEAK_ITEMS);

    return {
      studentId: target,
      classId: klass.publicId,
      evidence: {
        window: { from: window.from, to: window.to, days: window.days },
        totalEvents,
        attempts,
        correct,
        incorrect,
        accuracy: attempts === 0 ? null : Math.round((correct / attempts) * 1000) / 1000,
        assignedLessons: lessonIds.length,
        itemsWithEvidence: byItem.length,
      },
      weakItems: weak.map((item) => {
        const m = masteryByItem.get(item.learningItemPublicId);
        return {
          itemId: item.learningItemPublicId,
          state: item.state,
          correct: item.correctInWindow,
          incorrect: item.incorrectInWindow,
          dueAt: item.dueAt ?? m?.dueAt ?? null,
        };
      }),
    };
  }

  /** Student detail = roster entry + assignments + progress + recent evidence. */
  async getStudentDetail(
    actor: ActorContext,
    classId: unknown,
    studentId: unknown,
    now: Date,
  ): Promise<StudentDetailView> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const target = this.requireId(studentId, 'studentId');

    const roster = await this.deps.enrollments.listByClass(klass.publicId, MAX_ROSTER);
    const entry = roster.find((row) => row.studentPublicId === target);
    if (!entry) throw new TeacherNotFoundError();

    const assignments = await this.deps.assignments.listForStudent(klass.publicId, target);
    const lessonIds = [...new Set(assignments.map((a) => a.lessonPublicId))];
    const window = evidenceWindow(now, boundedWindowOr(undefined));

    const recent = await this.deps.evidence.listRecent(
      {
        studentPublicId: target,
        lessonPublicIds: lessonIds,
        from: window.from,
        to: window.to,
      },
      MAX_EVIDENCE_EVENTS,
    );

    const progress = await this.getStudentProgress(actor, klass.publicId, target, undefined, now);

    return {
      studentId: target,
      login: entry.studentLogin,
      displayName: entry.studentDisplayName,
      assignments: assignments.map((a) => this.toAssignmentView(a)),
      progress,
      recentEvidence: recent.map((e) => ({
        id: e.publicId,
        type: e.type,
        occurredAt: e.occurredAt,
        accepted: e.accepted,
        lessonId: e.lessonPublicId,
        itemId: e.learningItemPublicId,
      })),
    };
  }

  // --- private notes -------------------------------------------------------

  async createNote(
    actor: ActorContext,
    classId: unknown,
    input: CreateNoteInput,
    now: Date,
  ): Promise<NoteView> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const target = this.requireId(input.studentId, 'studentId');
    await this.requireEnrolled(klass, target);

    let body: string;
    let title: string | null;
    try {
      body = validateNoteBody(input.body);
      title = normaliseNoteTitle(input.title);
    } catch (error) {
      throw new TeacherInvalidInputError((error as Error).message);
    }

    const created = await this.deps.notes.create({
      authorPublicId: actor.publicId,
      classPublicId: klass.publicId,
      studentPublicId: target,
      title,
      body,
      createdAt: now,
    });
    if (!created) throw new TeacherError('TEACHER_CONFLICT', 'The note could not be saved');
    return this.toNoteView(created);
  }

  /** Notes are AUTHOR-ONLY: the repository is queried by author, always. */
  async listNotes(actor: ActorContext, classId: unknown, studentId: unknown): Promise<NoteView[]> {
    this.assertTeacher(actor);
    const klass = await this.loadReadableClass(actor, classId);
    const target = this.requireId(studentId, 'studentId');
    await this.requireEnrolled(klass, target);
    const rows = await this.deps.notes.listAuthored(actor.publicId, klass.publicId, target);
    return rows
      .filter((row) => row.authorPublicId === actor.publicId)
      .map((row) => this.toNoteView(row));
  }

  // --- internals -----------------------------------------------------------

  private assertTeacher(actor: ActorContext): void {
    if (!isTeacherOrAdmin(actor.roles as never)) {
      // Unreachable via the RoleGuard; kept as defence in depth.
      throw new TeacherNotFoundError();
    }
  }

  /**
   * Load a class and enforce READ visibility. Missing / foreign / malformed
   * ids all produce the SAME not-found error (no existence disclosure).
   */
  private async loadReadableClass(actor: ActorContext, classId: unknown): Promise<ClassRecord> {
    if (!isPublicId(classId)) throw new TeacherNotFoundError();
    const klass = await this.deps.classes.findByPublicId(classId);
    if (!klass) throw new TeacherNotFoundError();
    if (!canReadClass(actor.publicId, actor.roles as never, klass.ownerPublicId)) {
      throw new TeacherNotFoundError();
    }
    return klass;
  }

  /** The student must already be on this class' roster. */
  private async requireEnrolled(klass: ClassRecord, studentPublicId: string): Promise<void> {
    const enrolled = await this.deps.enrollments.isEnrolled(klass.publicId, studentPublicId);
    if (!enrolled) throw new TeacherNotFoundError();
  }

  private requireId(value: unknown, field: string): string {
    if (!isPublicId(value)) throw new TeacherInvalidInputError(`${field} must be a valid id`);
    return value;
  }

  private requireTitle(value: unknown): string {
    if (typeof value !== 'string') throw new TeacherInvalidInputError('title is required');
    const title = value.trim();
    if (title.length < 1 || [...title].length > CLASS_TITLE_MAX) {
      throw new TeacherInvalidInputError('title is invalid');
    }
    return title;
  }

  private optionalTerm(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new TeacherInvalidInputError('term is invalid');
    const term = value.trim();
    if (term.length === 0) return null;
    if ([...term].length > CLASS_TERM_MAX) throw new TeacherInvalidInputError('term is invalid');
    return term;
  }

  private optionalDueAt(value: unknown): Date | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new TeacherInvalidInputError('dueAt must be ISO-8601');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new TeacherInvalidInputError('dueAt is invalid');
    return parsed;
  }

  private toClassView(row: ClassRecord): ClassView {
    return {
      publicId: row.publicId,
      title: row.title,
      term: row.term,
      createdAt: row.createdAt,
      enrollmentCount: row.enrollmentCount,
    };
  }

  private toAssignmentView(row: {
    publicId: string;
    studentPublicId: string;
    lessonPublicId: string;
    lessonTitle: string;
    dueAt: Date | null;
    createdAt: Date;
  }): AssignmentView {
    return {
      id: row.publicId,
      studentId: row.studentPublicId,
      lessonId: row.lessonPublicId,
      lessonTitle: row.lessonTitle,
      dueAt: row.dueAt,
      createdAt: row.createdAt,
    };
  }

  private toNoteView(row: NoteRecord): NoteView {
    return {
      id: row.publicId,
      studentId: row.studentPublicId,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/** Parse an optional `?days=` query value into a number (or undefined). */
export function parseDays(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,4}$/.test(value)) return undefined;
  return Number(value);
}

export type { EvidenceWindow } from '../domain/teacher-policy';
