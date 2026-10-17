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
 *     returns the stored result and appends NO new evidence.
 *   - The answer key never leaves this service before a submission is stored.
 *   - The service does not read the clock directly; callers pass `now`
 *     (providers default to `new Date()`), keeping behaviour testable.
 *
 * Forbidden here (contract): teacher/class/assignment surfaces, analytics
 * dashboards, AI generation/hints, notifications, social features and any
 * unscoped cross-learner read.
 */
import { ContentValidationError } from '../../content/domain/content-errors';
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
import { type MasteryService } from '../../mastery/application/mastery-service';
import { type MasteryState } from '../../mastery/domain';
import {
  SESSION_TTL_MINUTES,
  StudentAlreadyAnsweredError,
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
  readonly next: {
    readonly action: NextAction;
    readonly remaining: number;
    readonly completedToday: number;
  };
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

    const batch = await this.deps.exercises.generate({
      lessonPublicId: candidate.lessonPublicId,
      mode: this.deps.mode ?? 'VI_TO_ZH',
      format: this.deps.format ?? 'TYPING',
      limit: 1,
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

    // Idempotent replay of the SAME token: same result, NO new evidence.
    if (submission && submission.submissionToken === submissionToken) {
      return this.toResultView(session, submission, await this.computeNext(actor, now));
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

    // CP-03 evidence (append-only), then CP-04 re-derive for this actor only.
    try {
      const event = await this.deps.events.record({
        type: 'ANSWER_SUBMITTED',
        actorPublicId: actor.publicId,
        occurredAt: now,
        lessonPublicId: session.lessonPublicId,
        learningItemPublicId: session.learningItemPublicId,
        exerciseRef: session.publicId,
        metadata: { outcome: verdict.correct ? 'correct' : 'incorrect' },
      });
      await this.deps.sessions.linkEvent(session.publicId, submissionToken, event.publicId);
    } catch {
      // Evidence failure must not lose the learner's answer: the submission is
      // already durable and a replay re-reads it. Nothing is logged here (the
      // answer key must never reach a log line).
    }

    try {
      await this.deps.mastery.deriveForActor(actor.publicId, now);
    } catch {
      // Projections are DERIVED and replaceable: a failure degrades TODAY
      // ordering until the next successful derive; it never loses evidence.
    }

    const next = await this.computeNext(actor, now);
    return this.toResultView(session, stored, next);
  }

  /** Re-read a RESULT (stable across reloads; owner-only). */
  async getResult(actor: ActorContext, sessionPublicId: string, now: Date): Promise<ResultView> {
    this.assertStudent(actor);
    const found = await this.deps.sessions.findWithSubmission(sessionPublicId, actor.publicId);
    if (!found || !found.submission) throw new StudentSessionNotFoundError();
    return this.toResultView(found.session, found.submission, await this.computeNext(actor, now));
  }

  // --- helpers -----------------------------------------------------------

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
  ): ResultView {
    return {
      sessionPublicId: session.publicId,
      correct: submission.correct,
      feedback: toFeedbackCode(submission.feedback),
      expected: submission.expected,
      received: submission.received,
      submittedAt: submission.createdAt,
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
