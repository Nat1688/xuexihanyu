/**
 * StudentService (CP-05) — the LOGIN -> TODAY -> CONTINUE -> EXERCISE ->
 * RESULT -> NEXT application loop.
 *
 * Composition, in order:
 *   TODAY     CP-04 projections + CP-01 published lessons -> deterministic queue.
 *   CONTINUE  pick the next queue entry (or the first unseen item) and ISSUE a
 *             CP-02 generated exercise as a persisted answer session.
 *   EXERCISE  the session is served WITHOUT its answer key.
 *   RESULT    the answer is evaluated by the pure CP-02 evaluator, then CP-03
 *             evidence is appended and CP-04 projections are re-derived for the
 *             actor. The RESULT payload carries correct/incorrect + feedback only.
 *   NEXT      derived from the remaining pool (CONTINUE / DONE / EMPTY).
 *
 * Invariants:
 *   - Ownership is server-derived (`ActorContext.publicId`), never a client id.
 *   - Every submission is IDEMPOTENT on its token; re-sending the same token
 *     returns the stored result and appends only evidence missing from a
 *     previous partial failure.
 *   - The answer key never leaves this service before a submission is stored.
 *   - The service does not read the clock directly; callers pass `now`
 *     (providers default to `new Date()`), keeping behaviour testable.
 *
 * Forbidden here (contract): teacher/class/assignment surfaces, analytics
 * dashboards, AI generation/hints, notifications, social features and any
 * unscoped cross-learner read.
 */
import { ContentValidationError } from '../../content/domain/content-errors';
import { createHash } from 'node:crypto';
import {
  answerFieldOf,
  evaluateAnswer,
  modeFieldBinding,
  questionFieldOf,
  type ExerciseFormat,
  type ExerciseInstance,
  type ExerciseMode,
  type LearnerExerciseView,
} from '../../exercise/domain';
import { type ExerciseService } from '../../exercise/application/exercise-service';
import { type LearningEventService } from '../../learning-events/application/learning-event-service';
import { LearningEventConflictError } from '../../learning-events/domain';
import { type MasteryService } from '../../mastery/application/mastery-service';
import { type MasteryState } from '../../mastery/domain';
import {
  SESSION_TTL_MINUTES,
  StudentAlreadyAnsweredError,
  StudentConflictError,
  StudentInvalidAnswerError,
  StudentInvalidTokenError,
  StudentNoContentError,
  StudentSessionExpiredError,
  StudentSessionNotFoundError,
  canAnswerSession,
  clampDailyGoal,
  isStudent,
  isValidSubmissionToken,
  nextActionFor,
  orderQueue,
  pickExerciseItem,
  type NextAction,
} from '../domain';
import {
  type AnswerSessionRecord,
  type AnswerSessionRepository,
  type AnswerSubmissionRecord,
  type StudentContentReader,
  type StudentLessonItem,
  type StudentProgressReader,
} from './student-ports';
import { type Role } from '../../identity/domain/role';

/** The authenticated caller of the student surface. */
export interface ActorContext {
  /** Public id of the acting user (server-derived from the session). */
  readonly publicId: string;
  readonly roles: readonly Role[];
}

/** One TODAY queue entry (learner-facing; no internal ids). */
export interface TodayEntry {
  readonly lessonPublicId: string;
  readonly lessonTitle: string;
  readonly learningItemPublicId: string;
  readonly state: MasteryState | null;
  readonly dueAt: Date | null;
  /** True when the CP-04 review is due at/before `generatedAt`. */
  readonly due: boolean;
}

/** The TODAY payload. */
export interface TodayView {
  readonly generatedAt: Date;
  readonly dailyGoal: number;
  readonly completedToday: number;
  readonly remaining: number;
  readonly entries: readonly TodayEntry[];
  /** True when there is nothing at all to practise (a first-class empty state). */
  readonly empty: boolean;
}

/** The learner-facing exercise (answer key and source field stripped). */
export interface ExerciseView {
  readonly sessionPublicId: string;
  readonly lessonPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  readonly prompt: string;
  readonly options: readonly string[] | null;
  readonly expiresAt: Date;
  /** The session can no longer be answered (already answered or expired). */
  readonly alreadyAnswered: boolean;
}

/** The RESULT payload. The expected value appears only AFTER submission. */
export interface ResultView {
  readonly sessionPublicId: string;
  readonly correct: boolean;
  readonly feedback: 'CORRECT' | 'INCORRECT';
  readonly expected: string;
  readonly received: string;
  readonly submittedAt: Date;
  /** Whether the durable evidence + mastery suffix completed for this response. */
  readonly integrityStatus: 'COMPLETE' | 'RECOVERY_REQUIRED';
  readonly next: {
    readonly action: NextAction;
    readonly remaining: number;
    readonly completedToday: number;
  };
}

/** Stable UUIDv5 evidence id for one answer session (retry/concurrency key). */
export function answerEvidencePublicId(sessionPublicId: string): string {
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(`xuexihanyu:answer-submitted:${sessionPublicId}`, 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

/** Dependencies (injectable; no Nest decorators so unit tests stay trivial). */
export interface StudentServiceDeps {
  readonly content: StudentContentReader;
  readonly progress: StudentProgressReader;
  readonly sessions: AnswerSessionRepository;
  readonly exercises: ExerciseService;
  readonly events: LearningEventService;
  readonly mastery: MasteryService;
  /** Exercise format served by the MVP (typing by default). */
  readonly format?: ExerciseFormat;
  /** CP-02 exercise mode served by the MVP (meaning/pinyin -> Chinese). */
  readonly mode?: ExerciseMode;
  /** Distractors per multiple-choice exercise (best effort). */
  readonly distractors?: number;
}

/** One queue candidate: a published item + its derivation state. */
interface Candidate {
  readonly lessonPublicId: string;
  readonly lessonTitle: string;
  readonly itemPublicId: string;
  readonly state: MasteryState | null;
  readonly dueAt: Date | null;
}

/** Start of the UTC day containing `now` (deterministic "today" boundary). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Is a verdict/answer combination consistent for feedback mapping? */
function toFeedbackCode(feedback: string): 'CORRECT' | 'INCORRECT' {
  return feedback === 'CORRECT' ? 'CORRECT' : 'INCORRECT';
}

export class StudentService {
  constructor(private readonly deps: StudentServiceDeps) {}

  /** Assert the caller may use the student surface (same refusal for non-students). */
  private assertStudent(actor: ActorContext): void {
    if (!isStudent(actor.roles)) throw new StudentNoContentError();
  }

  /**
   * Build the TODAY view: published lessons joined with the learner's CP-04
   * projections, deterministically ordered (due first, then mastery rank).
   */
  async getToday(actor: ActorContext, now: Date, requestedGoal?: unknown): Promise<TodayView> {
    this.assertStudent(actor);
    const goal = clampDailyGoal(requestedGoal);
    const completedToday = await this.deps.progress.countSubmissionsSince(
      actor.publicId,
      startOfUtcDay(now),
    );
    const pool = await this.buildPool(actor, now);

    const entries: TodayEntry[] = pool.slice(0, goal).map((candidate) => ({
      lessonPublicId: candidate.lessonPublicId,
      lessonTitle: candidate.lessonTitle,
      learningItemPublicId: candidate.itemPublicId,
      state: candidate.state,
      dueAt: candidate.dueAt,
      due: candidate.dueAt !== null && candidate.dueAt.getTime() <= now.getTime(),
    }));

    return {
      generatedAt: now,
      dailyGoal: goal,
      completedToday,
      remaining: entries.length,
      entries,
      empty: entries.length === 0,
    };
  }

  /**
   * Issue the NEXT exercise for the learner. The session is materialized (and
   * persisted) so the RESULT screen is stable; the answer key stays server-side.
   */
  async startNextExercise(
    actor: ActorContext,
    now: Date,
    requestedGoal?: unknown,
  ): Promise<ExerciseView> {
    this.assertStudent(actor);
    const goal = clampDailyGoal(requestedGoal);
    const [pool, completedToday] = await Promise.all([
      this.buildPool(actor, now),
      this.deps.progress.countSubmissionsSince(actor.publicId, startOfUtcDay(now)),
    ]);
    const candidate = pickExerciseItem(pool.slice(0, goal), completedToday);
    if (!candidate) throw new StudentNoContentError();

    return this.issueCandidate(actor, candidate, now);
  }

  /** CL-01: caller authorizes the assignment; this boundary still requires published content. */
  async startLessonExercise(
    actor: ActorContext,
    lessonPublicId: string,
    now: Date,
  ): Promise<ExerciseView> {
    this.assertStudent(actor);
    const pool = (await this.buildPool(actor, now)).filter(
      (row) => row.lessonPublicId === lessonPublicId,
    );
    const count = await this.deps.progress.countSubmissionsSince(
      actor.publicId,
      startOfUtcDay(now),
    );
    const candidate = pickExerciseItem(pool, count);
    if (!candidate) throw new StudentNoContentError();
    return this.issueCandidate(actor, candidate, now);
  }

  private async issueCandidate(
    actor: ActorContext,
    candidate: Candidate,
    now: Date,
  ): Promise<ExerciseView> {
    // Queue priority is independent of lesson position. CP-02 generates in
    // lesson order, so a one-item batch may omit the selected queue item.
    const lessonItems = await this.deps.content.listPublishedLessonItems(candidate.lessonPublicId);
    if (!lessonItems?.length) throw new StudentNoContentError();
    const batch = await this.deps.exercises.generate({
      lessonPublicId: candidate.lessonPublicId,
      mode: this.deps.mode ?? 'VI_TO_ZH',
      format: this.deps.format ?? 'TYPING',
      limit: lessonItems.length,
      distractors: this.deps.distractors ?? 3,
      seed: candidate.itemPublicId,
    });
    const instance = batch.instances.find(
      (candidateInstance) => candidateInstance.learningItemPublicId === candidate.itemPublicId,
    );
    if (!instance) {
      // Chosen item cannot produce an exercise in this mode (e.g. missing the
      // field the mode needs) -> empty state, not an unanswerable session.
      throw new StudentNoContentError();
    }

    const record = await this.deps.sessions.create({
      actorPublicId: actor.publicId,
      lessonPublicId: candidate.lessonPublicId,
      learningItemPublicId: instance.learningItemPublicId,
      mode: instance.mode,
      format: instance.format,
      prompt: instance.prompt,
      options: instance.options,
      answerKey: instance.answer,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000),
    });

    return this.toExerciseView(record, false);
  }

  /** Serve an EXERCISE by id, owner-only. Never includes the answer key. */
  async getExercise(
    actor: ActorContext,
    sessionPublicId: string,
    now: Date,
  ): Promise<ExerciseView> {
    this.assertStudent(actor);
    const found = await this.deps.sessions.findWithSubmission(sessionPublicId, actor.publicId);
    if (!found) throw new StudentSessionNotFoundError();
    const closed = found.submission !== null || found.session.expiresAt.getTime() <= now.getTime();
    return this.toExerciseView(found.session, closed);
  }

  /**
   * Answer an EXERCISE. Idempotent on `submissionToken`. On first success:
   * evaluate (pure CP-02), persist the submission, append CP-03 evidence, then
   * re-derive CP-04 projections for THIS actor. Returns RESULT + NEXT.
   */
  async submitAnswer(
    actor: ActorContext,
    sessionPublicId: string,
    submissionToken: unknown,
    answer: unknown,
    now: Date,
  ): Promise<ResultView> {
    this.assertStudent(actor);
    if (!isValidSubmissionToken(submissionToken)) throw new StudentInvalidTokenError();

    const found = await this.deps.sessions.findWithSubmission(sessionPublicId, actor.publicId);
    if (!found) throw new StudentSessionNotFoundError();
    const { session, submission } = found;

    // A same-token replay is also the recovery path for an earlier partial
    // failure: complete any missing evidence/link/projection before success.
    if (submission && submission.submissionToken === submissionToken) {
      const completed = await this.ensureSubmissionComplete(actor, session, submission, now);
      return this.toResultView(session, completed, await this.computeNext(actor, now), 'COMPLETE');
    }
    if (submission) throw new StudentAlreadyAnsweredError();

    const gate = canAnswerSession(
      { actorPublicId: session.actorPublicId, expiresAt: session.expiresAt, answered: false },
      actor.publicId,
      now,
    );
    if (!gate.allowed) {
      if (gate.reason === 'EXPIRED') throw new StudentSessionExpiredError();
      if (gate.reason === 'ALREADY_ANSWERED') throw new StudentAlreadyAnsweredError();
      throw new StudentSessionNotFoundError();
    }

    // Evaluate through the PURE CP-02 evaluator over a reconstructed instance.
    let verdict: ReturnType<typeof evaluateAnswer>;
    try {
      verdict = evaluateAnswer(this.reconstructInstance(session), answer);
    } catch (error) {
      // A malformed answer (wrong shape / option not offered) is a client
      // contract failure, never a 500 and never leaked as raw ORM text.
      if (error instanceof ContentValidationError) throw new StudentInvalidAnswerError();
      throw error;
    }

    // The repository is idempotent on (session, token) and rejects a DIFFERENT
    // token for an answered session (mapped to AlreadyAnswered upstream).
    const stored = await this.deps.sessions.insertSubmission({
      sessionPublicId: session.publicId,
      submissionToken,
      submittedAnswer: String(answer),
      correct: verdict.correct,
      feedback: verdict.feedback,
      expected: verdict.expected,
      received: verdict.received,
      learningEventPublicId: null,
    });

    const completed = await this.ensureSubmissionComplete(actor, session, stored, now);

    const next = await this.computeNext(actor, now);
    return this.toResultView(session, completed, next, 'COMPLETE');
  }

  /** Re-read a RESULT (stable across reloads; owner-only). */
  async getResult(actor: ActorContext, sessionPublicId: string, now: Date): Promise<ResultView> {
    this.assertStudent(actor);
    const found = await this.deps.sessions.findWithSubmission(sessionPublicId, actor.publicId);
    if (!found || !found.submission) throw new StudentSessionNotFoundError();
    // A read cannot prove that a prior mastery write completed without adding
    // new durable state. Be conservative: expose the stored verdict, but never
    // claim the submission pipeline is synchronized. The explicit POST repair
    // path returns COMPLETE only after derivation succeeds.
    return this.toResultView(
      found.session,
      found.submission,
      await this.computeNext(actor, now),
      'RECOVERY_REQUIRED',
    );
  }

  /**
   * Explicit, authenticated recovery for a previously persisted submission.
   * No token or answer is accepted: recovery can only replay the stored verdict
   * and timestamp through the idempotent evidence/mastery suffix.
   */
  async recoverResult(
    actor: ActorContext,
    sessionPublicId: string,
    now: Date,
  ): Promise<ResultView> {
    this.assertStudent(actor);
    const found = await this.deps.sessions.findWithSubmission(sessionPublicId, actor.publicId);
    if (!found || !found.submission) throw new StudentSessionNotFoundError();
    const completed = await this.ensureSubmissionComplete(
      actor,
      found.session,
      found.submission,
      now,
    );
    return this.toResultView(
      found.session,
      completed,
      await this.computeNext(actor, now),
      'COMPLETE',
    );
  }

  // --- helpers -----------------------------------------------------------

  /**
   * Complete the durable submission -> evidence -> projection pipeline.
   *
   * The event public id is deterministic per session, so concurrent retries
   * converge on one append through CP-03's unique public-id constraint. The
   * original submission timestamp and stored verdict are used on every retry,
   * making the append payload stable. Any failure is surfaced to the caller;
   * the same token or explicit recovery request safely retries the missing suffix.
   */
  private async ensureSubmissionComplete(
    actor: ActorContext,
    session: AnswerSessionRecord,
    submission: AnswerSubmissionRecord,
    now: Date,
  ): Promise<AnswerSubmissionRecord> {
    let completed = submission;
    if (!submission.learningEventPublicId) {
      let event;
      try {
        event = await this.deps.events.record({
          publicId: answerEvidencePublicId(session.publicId),
          type: 'ANSWER_SUBMITTED',
          actorPublicId: actor.publicId,
          occurredAt: submission.createdAt,
          lessonPublicId: session.lessonPublicId,
          learningItemPublicId: session.learningItemPublicId,
          exerciseRef: session.publicId,
          metadata: { outcome: submission.correct ? 'correct' : 'incorrect' },
        });
      } catch (error) {
        if (error instanceof LearningEventConflictError) {
          throw new StudentConflictError('Stored learning evidence conflicts with this result');
        }
        throw error;
      }
      await this.deps.sessions.linkEvent(
        session.publicId,
        submission.submissionToken,
        event.publicId,
      );
      completed = { ...submission, learningEventPublicId: event.publicId };
    }

    await this.deps.mastery.deriveForActor(actor.publicId, now);
    return completed;
  }

  /**
   * Build the deterministic candidate pool: due items first, then never-seen
   * items, then future-due items — each ordered by mastery rank then item id.
   */
  private async buildPool(actor: ActorContext, now: Date): Promise<Candidate[]> {
    const [lessons, projections] = await Promise.all([
      this.deps.content.listPublishedLessons(),
      this.deps.progress.listProjections(actor.publicId),
    ]);
    const byItem = new Map(projections.map((p) => [p.learningItemPublicId, p]));

    const candidates: Candidate[] = [];
    for (const lesson of lessons) {
      const items: StudentLessonItem[] | null = await this.deps.content.listPublishedLessonItems(
        lesson.lessonPublicId,
      );
      if (!items) continue;
      for (const item of items) {
        const projection = byItem.get(item.learningItemPublicId);
        candidates.push({
          lessonPublicId: lesson.lessonPublicId,
          lessonTitle: lesson.title,
          itemPublicId: item.learningItemPublicId,
          state: projection?.state ?? null,
          dueAt: projection?.dueAt ?? null,
        });
      }
    }

    const asQueue = (list: Candidate[]) =>
      list.map((c) => ({ ...c, learningItemPublicId: c.itemPublicId, dueAt: c.dueAt }));
    const back = (list: ReturnType<typeof asQueue>) =>
      list.map(({ learningItemPublicId: _ignored, ...rest }) => rest as Candidate);

    const isDue = (c: Candidate) => c.dueAt !== null && c.dueAt.getTime() <= now.getTime();
    const due = back(orderQueue(asQueue(candidates.filter(isDue)), now));
    const unseen = back(orderQueue(asQueue(candidates.filter((c) => c.dueAt === null)), now));
    const later = back(
      orderQueue(asQueue(candidates.filter((c) => c.dueAt !== null && !isDue(c))), now),
    );
    return [...due, ...unseen, ...later];
  }

  private reconstructInstance(session: AnswerSessionRecord): ExerciseInstance {
    // The CP-02 evaluator only needs mode/format/options/answer; the remaining
    // fields keep the instance shape honest without leaking anything.
    modeFieldBinding(session.mode);
    return {
      definition: {
        learningItemPublicId: session.learningItemPublicId,
        mode: session.mode,
        format: session.format,
      },
      learningItemPublicId: session.learningItemPublicId,
      mode: session.mode,
      format: session.format,
      questionField: questionFieldOf(session.mode),
      prompt: session.prompt,
      options: session.options,
      answer: session.answerKey,
    };
  }

  private toExerciseView(record: AnswerSessionRecord, closed: boolean): ExerciseView {
    return {
      sessionPublicId: record.publicId,
      lessonPublicId: record.lessonPublicId,
      mode: record.mode,
      format: record.format,
      prompt: record.prompt,
      options: record.options === null ? null : [...record.options],
      expiresAt: record.expiresAt,
      alreadyAnswered: closed,
    };
  }

  /** RESULT -> NEXT: how much due/unseen material remains for this learner. */
  private async computeNext(actor: ActorContext, now: Date): Promise<ResultView['next']> {
    const [completedToday, pool] = await Promise.all([
      this.deps.progress.countSubmissionsSince(actor.publicId, startOfUtcDay(now)),
      this.buildPool(actor, now),
    ]);
    return {
      action: nextActionFor(pool.length, completedToday),
      remaining: pool.length,
      completedToday,
    };
  }

  private toResultView(
    session: AnswerSessionRecord,
    submission: AnswerSubmissionRecord,
    next: ResultView['next'],
    integrityStatus: ResultView['integrityStatus'],
  ): ResultView {
    return {
      sessionPublicId: session.publicId,
      correct: submission.correct,
      feedback: toFeedbackCode(submission.feedback),
      expected: submission.expected,
      received: submission.received,
      submittedAt: submission.createdAt,
      integrityStatus,
      next,
    };
  }
}

/** Re-export the CP-02 learner projection type for controller typing. */
export type { LearnerExerciseView };

/** True when `error` is a CP-01/CP-02 content contract violation. */
export function isContentContractError(error: unknown): error is ContentValidationError {
  return error instanceof ContentValidationError;
}

/** Validate the exercised answer field is one the evaluator understands. */
export function answerFieldForMode(mode: ExerciseMode): string {
  return answerFieldOf(mode);
}
