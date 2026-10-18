/**
 * Teacher MVP ports (CP-06).
 *
 * Narrow read/write interfaces the application service composes. Every method
 * that touches a class-scoped resource takes the CLASS public id (never a
 * foreign student's row) so object-level authorization is enforced by the
 * service BEFORE any repository call — and, in the Prisma adapter, again by
 * scoping the query to the owning class.
 *
 * The ports return raw records with the owner class' public id; the service
 * is the single place that decides whether the caller may see them.
 */

export interface ActorContext {
  readonly publicId: string;
  readonly roles: readonly string[];
}

// --- classes ---------------------------------------------------------------

export interface ClassRecord {
  readonly publicId: string;
  readonly title: string;
  readonly term: string | null;
  readonly ownerPublicId: string;
  readonly createdAt: Date;
  readonly enrollmentCount: number;
}

export interface NewClass {
  readonly ownerPublicId: string;
  readonly title: string;
  readonly term: string | null;
}

export interface ClassRepository {
  /** Create a class owned by `ownerPublicId`; never accepts an arbitrary owner. */
  create(input: NewClass): Promise<ClassRecord | null>;
  /** List classes owned by the caller ONLY (ADMIN visibility is not applied here). */
  listOwned(ownerPublicId: string): Promise<ClassRecord[]>;
  /** Find a class by public id, returning its owner for the policy check. */
  findByPublicId(publicId: string): Promise<ClassRecord | null>;
}

// --- enrollment ------------------------------------------------------------

export interface EnrollmentRecord {
  readonly publicId: string;
  readonly classPublicId: string;
  readonly classOwnerPublicId: string;
  readonly studentPublicId: string;
  readonly studentLogin: string;
  readonly studentDisplayName: string | null;
  readonly enrolledAt: Date;
}

export interface StudentLookup {
  readonly publicId: string;
  readonly login: string;
  readonly state: string;
}

export interface EnrollmentRepository {
  /** Resolve a student by public id (ACTIVE-state check happens in the service). */
  findStudent(publicId: string): Promise<StudentLookup | null>;
  /** Idempotent-guard: is the (class, student) pair already enrolled? */
  exists(classPublicId: string, studentPublicId: string): Promise<boolean>;
  enroll(
    classPublicId: string,
    studentPublicId: string,
    at: Date,
  ): Promise<EnrollmentRecord | null>;
  listByClass(classPublicId: string, limit: number): Promise<EnrollmentRecord[]>;
  /** Is `studentPublicId` enrolled in `classPublicId`? (assignment scope check) */
  isEnrolled(classPublicId: string, studentPublicId: string): Promise<boolean>;
}

// --- assignments ------------------------------------------------------------

export interface AssignmentRecord {
  readonly publicId: string;
  readonly classPublicId: string;
  readonly classOwnerPublicId: string;
  readonly studentPublicId: string;
  readonly lessonPublicId: string;
  readonly lessonTitle: string;
  readonly dueAt: Date | null;
  readonly createdAt: Date;
}

export interface NewAssignment {
  readonly classPublicId: string;
  readonly studentPublicId: string;
  readonly lessonPublicId: string;
  readonly dueAt: Date | null;
  readonly createdAt: Date;
}

export interface AssignableLesson {
  readonly publicId: string;
  readonly title: string;
}

export interface AssignmentRepository {
  /** Look up an ASSIGNABLE (PUBLISHED) lesson by public id; null otherwise. */
  findPublishedLesson(lessonPublicId: string): Promise<AssignableLesson | null>;
  exists(classPublicId: string, studentPublicId: string, lessonPublicId: string): Promise<boolean>;
  create(input: NewAssignment): Promise<AssignmentRecord | null>;
  listForStudent(classPublicId: string, studentPublicId: string): Promise<AssignmentRecord[]>;
}

// --- progress evidence ------------------------------------------------------

export interface EvidenceEvent {
  readonly publicId: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly accepted: boolean | null;
  readonly lessonPublicId: string | null;
  readonly learningItemPublicId: string | null;
}

export interface ItemEvidenceCount {
  readonly learningItemPublicId: string;
  readonly correct: number;
  readonly incorrect: number;
}

export interface ItemMasteryRow {
  readonly learningItemPublicId: string;
  readonly state: string;
  readonly consecutiveCorrect: number;
  readonly dueAt: Date | null;
}

export interface EvidenceQuery {
  readonly studentPublicId: string;
  readonly lessonPublicIds: readonly string[];
  readonly from: Date;
  readonly to: Date;
}

/**
 * Evidence reader. Counting is scoped to the EVIDENCE OF RECORD (CP-03
 * learning events) for one student, and only within the lessons assigned to
 * that student in the class the caller proved visibility over — so the same
 * route cannot be used to probe outside the class scope.
 */
export interface EvidenceRepository {
  countByItem(query: EvidenceQuery): Promise<ItemEvidenceCount[]>;
  countEvents(query: EvidenceQuery): Promise<number>;
  listRecent(query: EvidenceQuery, limit: number): Promise<EvidenceEvent[]>;
  /** CP-04 derived projections for exactly the in-scope items. */
  masteryForItems(
    studentPublicId: string,
    learningItemPublicIds: readonly string[],
  ): Promise<ItemMasteryRow[]>;
}

// --- private notes ----------------------------------------------------------

export interface NoteRecord {
  readonly publicId: string;
  readonly authorPublicId: string;
  readonly classPublicId: string;
  readonly classOwnerPublicId: string;
  readonly studentPublicId: string;
  readonly title: string | null;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewNote {
  readonly authorPublicId: string;
  readonly classPublicId: string;
  readonly studentPublicId: string;
  readonly title: string | null;
  readonly body: string;
  readonly createdAt: Date;
}

export interface NoteRepository {
  create(input: NewNote): Promise<NoteRecord | null>;
  /** Notes authored by the caller for (class, student). */
  listAuthored(
    authorPublicId: string,
    classPublicId: string,
    studentPublicId: string,
  ): Promise<NoteRecord[]>;
}
