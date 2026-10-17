/**
 * Prisma-backed answer-session repository (CP-05).
 *
 * Correctness requirements, mapped to database constraints:
 *
 *   - OWNERSHIP. Every read filters by the session's actor AND the caller's
 *     actor id in one query. A session owned by someone else is reported as
 *     "not found", so public ids cannot be probed across learners.
 *   - IDEMPOTENCY. `answer_submissions` has UNIQUE (exercise_session_id,
 *     submission_token). `insertSubmission` therefore:
 *       1. inserts;
 *       2. on a unique violation, re-reads the session's effective submission —
 *          SAME token returns the stored row (idempotent replay), a DIFFERENT
 *          token means the result is already final (already-answered).
 *     There is no UPDATE/DELETE path that could overwrite a final answer.
 *   - NO ANSWER-KEY LEAK. `answerKey` is selected ONLY by the server-side
 *     lookup used for evaluation; the learner-facing projection is built in the
 *     service from non-secret fields.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../foundation/prisma.service';
import { StudentAlreadyAnsweredError, StudentConflictError } from '../domain';
import {
  type AnswerSessionRecord,
  type AnswerSessionRepository,
  type AnswerSubmissionRecord,
  type NewAnswerSession,
  type NewAnswerSubmission,
  type SessionWithSubmission,
} from '../application/student-ports';
import {
  type ExerciseFormat,
  type ExerciseMode,
  isExerciseFormat,
  isExerciseMode,
} from '../../exercise/domain';

/** Prisma unique-constraint violation code. */
const UNIQUE_VIOLATION = 'P2002';

const SESSION_SELECT = {
  publicId: true,
  mode: true,
  format: true,
  prompt: true,
  options: true,
  answerKey: true,
  expiresAt: true,
  createdAt: true,
  lesson: { select: { publicId: true } },
  learningItem: { select: { publicId: true } },
  actor: { select: { publicId: true } },
} satisfies Prisma.AnswerSessionSelect;

const SUBMISSION_SELECT = {
  submissionToken: true,
  submittedAnswer: true,
  correct: true,
  feedback: true,
  expected: true,
  received: true,
  learningEventPublicId: true,
  createdAt: true,
} satisfies Prisma.AnswerSubmissionSelect;

type SessionRow = Prisma.AnswerSessionGetPayload<{ select: typeof SESSION_SELECT }>;
type SubmissionRow = Prisma.AnswerSubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

/** Options are stored as JSON; only a string array is a valid stored shape. */
function toOptions(value: Prisma.JsonValue | null): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length === value.length ? strings : null;
}

function toSessionRecord(row: SessionRow): AnswerSessionRecord {
  if (!isExerciseMode(row.mode) || !isExerciseFormat(row.format)) {
    // Stored data our domain no longer accepts: fail closed, never guess.
    throw new StudentConflictError('Stored exercise session is not readable');
  }
  return {
    publicId: row.publicId,
    actorPublicId: row.actor.publicId,
    lessonPublicId: row.lesson.publicId,
    learningItemPublicId: row.learningItem.publicId,
    mode: row.mode as ExerciseMode,
    format: row.format as ExerciseFormat,
    prompt: row.prompt,
    options: toOptions(row.options),
    answerKey: row.answerKey,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function toSubmissionRecord(row: SubmissionRow): AnswerSubmissionRecord {
  return {
    submissionToken: row.submissionToken,
    submittedAnswer: row.submittedAnswer,
    correct: row.correct,
    feedback: row.feedback,
    expected: row.expected,
    received: row.received,
    learningEventPublicId: row.learningEventPublicId,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaAnswerSessionRepository implements AnswerSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the acting user's surrogate id (null when the user is unknown). */
  private async actorId(actorPublicId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { publicId: actorPublicId },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async create(input: NewAnswerSession): Promise<AnswerSessionRecord> {
    const actorId = await this.actorId(input.actorPublicId);
    if (!actorId) throw new StudentConflictError('Unknown learner');

    const [lesson, item] = await Promise.all([
      this.prisma.lesson.findUnique({
        where: { publicId: input.lessonPublicId },
        select: { id: true },
      }),
      this.prisma.learningItem.findUnique({
        where: { publicId: input.learningItemPublicId },
        select: { id: true },
      }),
    ]);
    if (!lesson || !item) throw new StudentConflictError('Exercise source is no longer available');

    const row = await this.prisma.answerSession.create({
      data: {
        actorId,
        lessonId: lesson.id,
        learningItemId: item.id,
        mode: input.mode,
        format: input.format,
        prompt: input.prompt,
        options: input.options === null ? Prisma.JsonNull : [...input.options],
        answerKey: input.answerKey,
        expiresAt: input.expiresAt,
      },
      select: SESSION_SELECT,
    });
    return toSessionRecord(row);
  }

  async findByPublicId(
    publicId: string,
    actorPublicId: string,
  ): Promise<AnswerSessionRecord | null> {
    const actorId = await this.actorId(actorPublicId);
    if (!actorId) return null;
    const row = await this.prisma.answerSession.findFirst({
      where: { publicId, actorId },
      select: SESSION_SELECT,
    });
    return row ? toSessionRecord(row) : null;
  }

  async findWithSubmission(
    publicId: string,
    actorPublicId: string,
  ): Promise<SessionWithSubmission | null> {
    const actorId = await this.actorId(actorPublicId);
    if (!actorId) return null;
    const row = await this.prisma.answerSession.findFirst({
      where: { publicId, actorId },
      select: {
        ...SESSION_SELECT,
        submissions: {
          select: SUBMISSION_SELECT,
          orderBy: [{ createdAt: 'asc' }],
          take: 1,
        },
      },
    });
    if (!row) return null;
    const { submissions, ...sessionRow } = row;
    const first = submissions[0];
    return {
      session: toSessionRecord(sessionRow as SessionRow),
      submission: first ? toSubmissionRecord(first) : null,
    };
  }

  async insertSubmission(input: NewAnswerSubmission): Promise<AnswerSubmissionRecord> {
    // Resolve the session by public id, then insert. The unique
    // (session, token) index makes a replay a no-op rather than a duplicate.
    const session = await this.prisma.answerSession.findUnique({
      where: { publicId: input.sessionPublicId },
      select: { id: true },
    });
    if (!session) throw new StudentConflictError('Exercise session is no longer available');

    try {
      const row = await this.prisma.answerSubmission.create({
        data: {
          exerciseSessionId: session.id,
          submissionToken: input.submissionToken,
          submittedAnswer: input.submittedAnswer,
          correct: input.correct,
          feedback: input.feedback,
          expected: input.expected,
          received: input.received,
          learningEventPublicId: input.learningEventPublicId,
        },
        select: SUBMISSION_SELECT,
      });
      return toSubmissionRecord(row);
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== UNIQUE_VIOLATION
      ) {
        throw error;
      }
      // Unique violation: either a same-token replay (return the stored row) or
      // a different token racing the winner (conflict — result is final).
      const existing = await this.prisma.answerSubmission.findFirst({
        where: { exerciseSessionId: session.id },
        select: SUBMISSION_SELECT,
      });
      if (existing && existing.submissionToken === input.submissionToken) {
        return toSubmissionRecord(existing);
      }
      throw new StudentAlreadyAnsweredError();
    }
  }

  async linkEvent(
    sessionPublicId: string,
    token: string,
    learningEventPublicId: string,
  ): Promise<void> {
    await this.prisma.answerSubmission.updateMany({
      where: {
        submissionToken: token,
        exerciseSession: { publicId: sessionPublicId },
      },
      data: { learningEventPublicId },
    });
  }
}
