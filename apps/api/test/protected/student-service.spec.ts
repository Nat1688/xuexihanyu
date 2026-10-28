/**
 * CP-05 student loop — application tests (no Nest, no DB).
 *
 * Proves the vertical slice end-to-end over in-memory fakes:
 *   - TODAY is built from PUBLISHED lessons + CP-04 projections, ordered
 *     deterministically (due first, then mastery rank), and reports an empty
 *     state when there is no content;
 *   - CONTINUE issues a persisted session and NEVER exposes the answer key;
 *   - EXERCISE is owner-only: another learner's session reads as not-found;
 *   - RESULT evaluates via CP-02, appends CP-03 evidence, re-derives CP-04 and
 *     reports NEXT;
 *   - a replayed submission token returns the SAME result with NO duplicate
 *     evidence, a different token for an answered session is refused, and an
 *     expired session cannot be answered;
 *   - the student surface refuses non-student callers and never touches
 *     another learner's state.
 */
import { ExerciseService } from '../../src/modules/exercise/application/exercise-service';
import { LearningEventService } from '../../src/modules/learning-events/application/learning-event-service';
import { LearningEventConflictError } from '../../src/modules/learning-events/domain';
import { MasteryService } from '../../src/modules/mastery/application/mastery-service';
import { type MasteryState } from '../../src/modules/mastery/domain';
import {
  StudentAlreadyAnsweredError,
  StudentConflictError,
  StudentNoContentError,
  StudentSessionExpiredError,
  StudentSessionNotFoundError,
} from '../../src/modules/student/domain';
import {
  StudentService,
  type ActorContext,
} from '../../src/modules/student/application/student-service';
import {
  type AnswerSessionRecord,
  type AnswerSessionRepository,
  type AnswerSubmissionRecord,
  type NewAnswerSession,
  type NewAnswerSubmission,
  type SessionWithSubmission,
  type StudentContentReader,
  type StudentLesson,
  type StudentLessonItem,
  type StudentProgressReader,
  type StudentProjection,
} from '../../src/modules/student/application/student-ports';
import { FakeExerciseContentReader } from '../support/fake-exercise-content-reader';

const ACTOR: ActorContext = { publicId: 'actor-1', roles: ['STUDENT'] };
const OTHER: ActorContext = { publicId: 'actor-2', roles: ['STUDENT'] };
const NOW = new Date('2026-10-17T10:00:00.000Z');
const TOKEN = 'token-0123456789abcdef';

// --- fakes -----------------------------------------------------------------

class FakeStudentContent implements StudentContentReader {
  readonly lessons = new Map<string, StudentLesson>();
  readonly items = new Map<string, StudentLessonItem[]>();

  add(lessonId: string, itemIds: readonly string[]): this {
    this.lessons.set(lessonId, {
      lessonPublicId: lessonId,
      title: `Lesson ${lessonId}`,
      unitPublicId: 'u1',
      coursePublicId: 'c1',
      position: this.lessons.size,
    });
    this.items.set(
      lessonId,
      itemIds.map((id) => ({ learningItemPublicId: id, simplified: id, pinyin: id, meaning: id })),
    );
    return this;
  }

  async listPublishedLessons(): Promise<StudentLesson[]> {
    return [...this.lessons.values()];
  }

  async listPublishedLessonItems(lessonPublicId: string): Promise<StudentLessonItem[] | null> {
    return this.items.get(lessonPublicId) ?? null;
  }
}

class FakeProgress implements StudentProgressReader {
  projections: StudentProjection[] = [];
  submissions = 0;
  deriveCalls = 0;

  async listProjections(): Promise<StudentProjection[]> {
    return [...this.projections];
  }

  async countSubmissionsSince(): Promise<number> {
    return this.submissions;
  }
}

class FakeSessions implements AnswerSessionRepository {
  readonly rows = new Map<string, AnswerSessionRecord>();
  readonly submissions = new Map<string, AnswerSubmissionRecord>();
  failLinkCount = 0;
  private sequence = 0;

  async create(input: NewAnswerSession): Promise<AnswerSessionRecord> {
    this.sequence += 1;
    const record: AnswerSessionRecord = {
      publicId: `s${this.sequence}`,
      actorPublicId: input.actorPublicId,
      lessonPublicId: input.lessonPublicId,
      learningItemPublicId: input.learningItemPublicId,
      mode: input.mode,
      format: input.format,
      prompt: input.prompt,
      options: input.options,
      answerKey: input.answerKey,
      expiresAt: input.expiresAt,
      createdAt: NOW,
    };
    this.rows.set(record.publicId, record);
    return record;
  }

  async findByPublicId(id: string, actor: string): Promise<AnswerSessionRecord | null> {
    const row = this.rows.get(id);
    return row && row.actorPublicId === actor ? row : null;
  }

  async findWithSubmission(id: string, actor: string): Promise<SessionWithSubmission | null> {
    const session = await this.findByPublicId(id, actor);
    if (!session) return null;
    return { session, submission: this.submissions.get(id) ?? null };
  }

  async insertSubmission(input: NewAnswerSubmission): Promise<AnswerSubmissionRecord> {
    const existing = this.submissions.get(input.sessionPublicId);
    if (existing) {
      if (existing.submissionToken === input.submissionToken) return existing;
      throw new StudentAlreadyAnsweredError();
    }
    const record: AnswerSubmissionRecord = {
      submissionToken: input.submissionToken,
      submittedAnswer: input.submittedAnswer,
      correct: input.correct,
      feedback: input.feedback,
      expected: input.expected,
      received: input.received,
      learningEventPublicId: input.learningEventPublicId,
      createdAt: NOW,
    };
    this.submissions.set(input.sessionPublicId, record);
    return record;
  }

  async linkEvent(id: string, token: string, eventPublicId: string): Promise<void> {
    if (this.failLinkCount > 0) {
      this.failLinkCount -= 1;
      throw new Error('simulated link failure');
    }
    const row = this.submissions.get(id);
    if (!row || row.submissionToken !== token) throw new Error('submission not found');
    this.submissions.set(id, { ...row, learningEventPublicId: eventPublicId });
  }
}

interface HarnessOptions {
  readonly eventFailures?: number;
  readonly masteryFailures?: number;
}

function harness(options: HarnessOptions = {}) {
  const content = new FakeStudentContent().add('l1', ['i1', 'i2', 'i3']);
  const exerciseContent = new FakeExerciseContentReader();
  for (const id of ['i1', 'i2', 'i3']) {
    exerciseContent.addItem({
      learningItemPublicId: id,
      simplified: id,
      pinyin: `p-${id}`,
      meaning: `m-${id}`,
    });
  }
  exerciseContent.addLesson('l1', ['i1', 'i2', 'i3']);

  const progress = new FakeProgress();
  const sessions = new FakeSessions();

  let eventFailures = options.eventFailures ?? 0;
  const eventRows = new Map<string, { publicId: string }>();
  const events = {
    record: jest.fn(async (input: { publicId?: unknown }) => {
      if (eventFailures > 0) {
        eventFailures -= 1;
        throw new Error('simulated event append failure');
      }
      const publicId = String(input.publicId);
      const existing = eventRows.get(publicId);
      if (existing) return existing;
      // Model a database race: yield, then re-check the unique idempotency key.
      await Promise.resolve();
      const raced = eventRows.get(publicId);
      if (raced) return raced;
      const stored = { publicId };
      eventRows.set(publicId, stored);
      return stored;
    }),
  } as unknown as LearningEventService;

  let masteryFailures = options.masteryFailures ?? 0;
  const mastery = {
    deriveForActor: jest.fn(async () => {
      if (masteryFailures > 0) {
        masteryFailures -= 1;
        throw new Error('simulated mastery failure');
      }
      progress.deriveCalls += 1;
      progress.projections = [
        { learningItemPublicId: 'i1', state: 'LEARNING' as MasteryState, dueAt: NOW },
      ];
    }),
  } as unknown as MasteryService;

  const service = new StudentService({
    content,
    progress,
    sessions,
    exercises: new ExerciseService({ content: exerciseContent }),
    events,
    mastery,
    mode: 'VI_TO_ZH',
    format: 'TYPING',
  });

  return {
    service,
    content,
    progress,
    sessions,
    events,
    eventRows,
    mastery,
    exerciseContent,
  };
}

// --- tests -----------------------------------------------------------------

describe('StudentService — TODAY', () => {
  it('builds a deterministic queue from published content', async () => {
    const { service } = harness();
    const today = await service.getToday(ACTOR, NOW);
    expect(today.empty).toBe(false);
    expect(today.entries.map((e) => e.learningItemPublicId)).toEqual(['i1', 'i2', 'i3']);
    expect(today.completedToday).toBe(0);
    expect(today.entries[0]).not.toHaveProperty('answerKey');
  });

  it('orders DUE items before never-seen items', async () => {
    const { service, progress } = harness();
    progress.projections = [
      { learningItemPublicId: 'i3', state: 'MASTERED', dueAt: new Date(NOW.getTime() - 60_000) },
    ];
    const today = await service.getToday(ACTOR, NOW);
    expect(today.entries[0].learningItemPublicId).toBe('i3');
    expect(today.entries[0].due).toBe(true);
  });

  it('reports an empty state when nothing is published', async () => {
    const { service, content } = harness();
    content.lessons.clear();
    const today = await service.getToday(ACTOR, NOW);
    expect(today.empty).toBe(true);
    expect(today.entries).toHaveLength(0);
  });

  it('refuses non-student callers', async () => {
    const { service } = harness();
    await expect(
      service.getToday({ publicId: 't1', roles: ['TEACHER'] }, NOW),
    ).rejects.toBeInstanceOf(StudentNoContentError);
  });

  it('clamps an oversized daily goal', async () => {
    const { service } = harness();
    const today = await service.getToday(ACTOR, NOW, 9999);
    expect(today.dailyGoal).toBe(20);
  });
});

describe('StudentService — CONTINUE / EXERCISE', () => {
  it('generates the due queue item even when it is last in lesson order', async () => {
    const { service, progress, sessions } = harness();
    progress.projections = [
      { learningItemPublicId: 'i3', state: 'LEARNING', dueAt: new Date(NOW.getTime() - 1000) },
    ];
    const view = await service.startNextExercise(ACTOR, NOW);
    expect(view.prompt).toBe('m-i3');
    expect(sessions.rows.get(view.sessionPublicId)?.learningItemPublicId).toBe('i3');
    expect(sessions.rows.get(view.sessionPublicId)?.answerKey).toBe('i3');
  });

  it('continues to the second queue item after a completed submission', async () => {
    const { service, progress, sessions } = harness();
    progress.submissions = 1;
    const view = await service.startNextExercise(ACTOR, NOW);
    expect(sessions.rows.get(view.sessionPublicId)?.learningItemPublicId).toBe('i2');
    expect(view.prompt).toBe('m-i2');
  });

  it('issues a session without the answer key and persists it', async () => {
    const { service, sessions } = harness();
    const view = await service.startNextExercise(ACTOR, NOW);
    expect(view.sessionPublicId).toBe('s1');
    expect(view.prompt).toBe('m-i1');
    expect(view.alreadyAnswered).toBe(false);
    expect(view).not.toHaveProperty('answerKey');
    // The prompt is the MEANING ('m-i1'); the answer itself is not projected.
    expect(view.prompt).not.toBe('i1');
    expect(sessions.rows.get('s1')?.answerKey).toBe('i1');
  });

  it('does not leak another learner’s session', async () => {
    const { service } = harness();
    const view = await service.startNextExercise(ACTOR, NOW);
    await expect(service.getExercise(OTHER, view.sessionPublicId, NOW)).rejects.toBeInstanceOf(
      StudentSessionNotFoundError,
    );
  });

  it('refuses CONTINUE when there is no published content', async () => {
    const { service, content } = harness();
    content.lessons.clear();
    await expect(service.startNextExercise(ACTOR, NOW)).rejects.toBeInstanceOf(
      StudentNoContentError,
    );
  });
});

describe('StudentService — RESULT', () => {
  it('evaluates, appends evidence, re-derives mastery and routes NEXT', async () => {
    const { service, progress, events, mastery } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    const result = await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);

    expect(result.correct).toBe(true);
    expect(result.feedback).toBe('CORRECT');
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(mastery.deriveForActor).toHaveBeenCalledWith(ACTOR.publicId, NOW);
    expect(progress.deriveCalls).toBe(1);
    expect(result.next.completedToday).toBe(0);
  });

  it('marks a wrong answer INCORRECT and reveals the expected value only after submit', async () => {
    const { service } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    const result = await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'nope', NOW);
    expect(result.correct).toBe(false);
    expect(result.feedback).toBe('INCORRECT');
    expect(result.expected).toBe('i1');
  });

  it('is idempotent on the same submission token (one piece of evidence)', async () => {
    const { service, events, eventRows, sessions } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    const first = await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);
    const replay = await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);

    expect(replay).toEqual(first);
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(eventRows.size).toBe(1);
    expect(sessions.submissions.size).toBe(1);
    expect(sessions.submissions.get('s1')?.learningEventPublicId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('surfaces append failure and the same-token retry completes missing evidence', async () => {
    const { service, sessions, eventRows, mastery } = harness({ eventFailures: 1 });
    const exercise = await service.startNextExercise(ACTOR, NOW);

    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ).rejects.toThrow('simulated event append failure');
    expect(sessions.submissions.get('s1')?.learningEventPublicId).toBeNull();
    expect(mastery.deriveForActor).not.toHaveBeenCalled();

    const recovered = await service.submitAnswer(
      ACTOR,
      exercise.sessionPublicId,
      TOKEN,
      'ignored-on-retry',
      NOW,
    );
    expect(recovered.correct).toBe(true);
    expect(eventRows.size).toBe(1);
    expect(sessions.submissions.get('s1')?.learningEventPublicId).not.toBeNull();
    expect(mastery.deriveForActor).toHaveBeenCalledTimes(1);
  });

  it('reuses the appended event when retrying after the audit-link write fails', async () => {
    const { service, sessions, events, eventRows } = harness();
    sessions.failLinkCount = 1;
    const exercise = await service.startNextExercise(ACTOR, NOW);

    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ).rejects.toThrow('simulated link failure');
    expect(eventRows.size).toBe(1);
    expect(sessions.submissions.get('s1')?.learningEventPublicId).toBeNull();

    await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);
    expect(events.record).toHaveBeenCalledTimes(2);
    expect(eventRows.size).toBe(1);
    expect(sessions.submissions.get('s1')?.learningEventPublicId).toBe([...eventRows.keys()][0]);
  });

  it('concurrent same-token retries converge on one submission and one event', async () => {
    const { service, sessions, eventRows } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);

    const [left, right] = await Promise.all([
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ]);

    expect(left).toEqual(right);
    expect(sessions.submissions.size).toBe(1);
    expect(eventRows.size).toBe(1);
  });

  it('concurrent different-token submissions leave exactly one effective answer', async () => {
    const { service, sessions, eventRows } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);

    const settled = await Promise.allSettled([
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
      service.submitAnswer(ACTOR, exercise.sessionPublicId, `${TOKEN}-other`, 'nope', NOW),
    ]);

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(sessions.submissions.size).toBe(1);
    expect(eventRows.size).toBe(1);
  });

  it('keeps evidence linked when mastery fails and re-derives it on retry', async () => {
    const { service, sessions, events, eventRows, mastery } = harness({ masteryFailures: 1 });
    const exercise = await service.startNextExercise(ACTOR, NOW);

    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ).rejects.toThrow('simulated mastery failure');
    expect(sessions.submissions.get('s1')?.learningEventPublicId).not.toBeNull();
    expect(eventRows.size).toBe(1);

    const partial = await service.getResult(ACTOR, exercise.sessionPublicId, NOW);
    expect(partial.integrityStatus).toBe('RECOVERY_REQUIRED');
    expect(mastery.deriveForActor).toHaveBeenCalledTimes(1);

    await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(mastery.deriveForActor).toHaveBeenCalledTimes(2);
  });

  it('keeps GET RESULT read-only and repairs a partial submission through explicit recovery', async () => {
    const { service, sessions, events, eventRows, mastery } = harness({ eventFailures: 1 });
    const exercise = await service.startNextExercise(ACTOR, NOW);
    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ).rejects.toThrow('simulated event append failure');

    const read = await service.getResult(ACTOR, exercise.sessionPublicId, NOW);
    expect(read.correct).toBe(true);
    expect(read.integrityStatus).toBe('RECOVERY_REQUIRED');
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(mastery.deriveForActor).not.toHaveBeenCalled();
    expect(sessions.submissions.get('s1')?.learningEventPublicId).toBeNull();

    const [left, right] = await Promise.all([
      service.recoverResult(ACTOR, exercise.sessionPublicId, NOW),
      service.recoverResult(ACTOR, exercise.sessionPublicId, NOW),
    ]);
    expect(left).toEqual(right);
    expect(left.integrityStatus).toBe('COMPLETE');
    expect(eventRows.size).toBe(1);
    expect(sessions.submissions.get('s1')?.learningEventPublicId).not.toBeNull();
  });

  it('maps a semantic event-id collision to a safe student conflict', async () => {
    const { service, events } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    (events.record as jest.Mock).mockRejectedValueOnce(new LearningEventConflictError());

    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ).rejects.toBeInstanceOf(StudentConflictError);
  });

  it('refuses a DIFFERENT token for an already-answered session', async () => {
    const { service } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);
    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, `${TOKEN}-2`, 'i1', NOW),
    ).rejects.toBeInstanceOf(StudentAlreadyAnsweredError);
  });

  it('refuses an expired session', async () => {
    const { service } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    const later = new Date(exercise.expiresAt.getTime() + 1_000);
    await expect(
      service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', later),
    ).rejects.toBeInstanceOf(StudentSessionExpiredError);
  });

  it('refuses another learner answering the session', async () => {
    const { service } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    await expect(
      service.submitAnswer(OTHER, exercise.sessionPublicId, TOKEN, 'i1', NOW),
    ).rejects.toBeInstanceOf(StudentSessionNotFoundError);
  });

  it('re-reads a stable RESULT after reload', async () => {
    const { service } = harness();
    const exercise = await service.startNextExercise(ACTOR, NOW);
    const submitted = await service.submitAnswer(ACTOR, exercise.sessionPublicId, TOKEN, 'i1', NOW);
    const reread = await service.getResult(ACTOR, exercise.sessionPublicId, NOW);
    expect(reread.correct).toBe(submitted.correct);
    expect(reread.feedback).toBe(submitted.feedback);
  });
});
