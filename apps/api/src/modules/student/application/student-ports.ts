/**
 * Student MVP persistence + projection ports (CP-05).
 *
 * The application service depends ONLY on these narrow interfaces; Prisma lives
 * behind them in `infrastructure/`. The ports are split by concern so tests can
 * substitute a deterministic fake for each:
 *
 *   - {@link StudentContentReader}  published lessons + ordered items for the
 *                                   learner to practise (reuses the CP-02
 *                                   approved-content rule: PUBLISHED only).
 *   - {@link StudentProgressReader} the learner's CP-04 projections and today's
 *                                   submitted-answer count (ordering + goal).
 *   - {@link AnswerSessionRepository} issue/lookup exercise sessions and store
 *                                   idempotent submissions.
 *
 * No port here can CREATE or MUTATE content, events (CP-03 owns evidence) or
 * mastery projections (CP-04 owns derivation). Writes are limited to the two
 * CP-05 linkage tables.
 */
import { type ExerciseFormat, type ExerciseMode } from '../../exercise/domain';
import { type MasteryState } from '../../mastery/domain';

/** A published lesson as seen by a learner (no author/admin fields). */
export interface StudentLesson {
  readonly lessonPublicId: string;
  readonly title: string;
  readonly unitPublicId: string;
  readonly coursePublicId: string;
  /** 1-based teaching order within the published corpus. */
  readonly position: number;
}

/** A learning item attached to a lesson, in lesson position order. */
export interface StudentLessonItem {
  readonly learningItemPublicId: string;
  readonly simplified: string | null;
  readonly pinyin: string | null;
  readonly meaning: string | null;
}

/** Read-only view over PUBLISHED content available to a learner. */
export interface StudentContentReader {
  /**
   * Published lessons in a deterministic teaching order (course, unit, lesson
   * position, public id). An empty array is a valid "no content" answer.
   */
  listPublishedLessons(): Promise<StudentLesson[]>;
  /** Ordered items of a published lesson; null when the lesson is not published. */
  listPublishedLessonItems(lessonPublicId: string): Promise<StudentLessonItem[] | null>;
}

/** A CP-04 projection as consumed for TODAY ordering. */
export interface StudentProjection {
  readonly learningItemPublicId: string;
  readonly state: MasteryState;
  readonly dueAt: Date;
}

/** Read-only learner progress used to build TODAY. */
export interface StudentProgressReader {
  /** All CP-04 projections for the learner (may be empty). */
  listProjections(actorPublicId: string): Promise<StudentProjection[]>;
  /**
   * Number of effective submissions by the learner since `since` (UTC). Drives
   * the daily goal and deterministic CONTINUE stepping.
   */
  countSubmissionsSince(actorPublicId: string, since: Date): Promise<number>;
}

/** A session row as persisted (includes the server-only answer key). */
export interface AnswerSessionRecord {
  readonly publicId: string;
  readonly actorPublicId: string;
  readonly lessonPublicId: string;
  readonly learningItemPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  readonly prompt: string;
  readonly options: readonly string[] | null;
  readonly answerKey: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

/** A new session to persist. */
export interface NewAnswerSession {
  readonly actorPublicId: string;
  readonly lessonPublicId: string;
  readonly learningItemPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  readonly prompt: string;
  readonly options: readonly string[] | null;
  readonly answerKey: string;
  readonly expiresAt: Date;
}

/** An effective submission as persisted. */
export interface AnswerSubmissionRecord {
  readonly submissionToken: string;
  readonly submittedAnswer: string;
  readonly correct: boolean;
  readonly feedback: string;
  readonly expected: string;
  readonly received: string;
  readonly learningEventPublicId: string | null;
  readonly createdAt: Date;
}

/** A new submission to persist. */
export interface NewAnswerSubmission {
  readonly sessionPublicId: string;
  readonly submissionToken: string;
  readonly submittedAnswer: string;
  readonly correct: boolean;
  readonly feedback: string;
  readonly expected: string;
  readonly received: string;
  readonly learningEventPublicId: string | null;
}

/** Session + its effective submission, resolved together for RESULT screens. */
export interface SessionWithSubmission {
  readonly session: AnswerSessionRecord;
  readonly submission: AnswerSubmissionRecord | null;
}

/** Persistence port for exercise sessions and idempotent submissions. */
export interface AnswerSessionRepository {
  /** Persist a freshly generated session and return it. */
  create(input: NewAnswerSession): Promise<AnswerSessionRecord>;
  /**
   * Load a session by its public id. A session owned by a different learner is
   * surfaced as `null` (never as "forbidden"), so ids cannot be enumerated.
   */
  findByPublicId(publicId: string, actorPublicId: string): Promise<AnswerSessionRecord | null>;
  /** Load the session with its EFFECTIVE submission (first by created_at). */
  findWithSubmission(
    publicId: string,
    actorPublicId: string,
  ): Promise<SessionWithSubmission | null>;
  /**
   * Insert a submission. Must be IDEMPOTENT on (session, token): when the token
   * already exists, return the stored record instead of writing. Must throw a
   * conflict-typed error when a DIFFERENT token already exists for the session.
   */
  insertSubmission(input: NewAnswerSubmission): Promise<AnswerSubmissionRecord>;
  /** Attach the CP-03 evidence public id to a stored submission (audit link). */
  linkEvent(sessionPublicId: string, token: string, learningEventPublicId: string): Promise<void>;
}
