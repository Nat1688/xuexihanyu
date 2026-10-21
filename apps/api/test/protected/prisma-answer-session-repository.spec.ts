import { Prisma } from '@prisma/client';

import {
  StudentAlreadyAnsweredError,
  StudentConflictError,
} from '../../src/modules/student/domain';
import { PrismaAnswerSessionRepository } from '../../src/modules/student/infrastructure/prisma-answer-session.repository';

const SUBMISSION_KEY = ['synthetic', 'submission', '0123456789abcdef'].join('-');
const CREATED_AT = new Date('2026-10-20T10:00:00.000Z');

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['exercise_session_id'] },
  });
}

function stored(token: string) {
  return {
    submissionToken: token,
    submittedAnswer: '你',
    correct: true,
    feedback: 'CORRECT',
    expected: '你',
    received: '你',
    learningEventPublicId: null,
    createdAt: CREATED_AT,
  };
}

function input(token: string) {
  return {
    sessionPublicId: 'session-1',
    submissionToken: token,
    submittedAnswer: '你',
    correct: true,
    feedback: 'CORRECT',
    expected: '你',
    received: '你',
    learningEventPublicId: null,
  };
}

function repositoryWith(existing: ReturnType<typeof stored> | null) {
  const prisma = {
    answerSession: {
      findUnique: jest.fn(async () => ({ id: 'session-internal' })),
    },
    answerSubmission: {
      create: jest.fn(async () => Promise.reject(uniqueViolation())),
      findFirst: jest.fn(async () => existing),
    },
  };
  return new PrismaAnswerSessionRepository(prisma as never);
}

describe('PrismaAnswerSessionRepository submission uniqueness', () => {
  it('returns the stored winner for a same-token unique race', async () => {
    const repository = repositoryWith(stored(SUBMISSION_KEY));

    await expect(repository.insertSubmission(input(SUBMISSION_KEY))).resolves.toEqual(
      stored(SUBMISSION_KEY),
    );
  });

  it('rejects a different token after the per-session unique constraint wins', async () => {
    const repository = repositoryWith(stored(`${SUBMISSION_KEY}-winner`));

    await expect(repository.insertSubmission(input(SUBMISSION_KEY))).rejects.toBeInstanceOf(
      StudentAlreadyAnsweredError,
    );
  });

  it('uses a safe retryable conflict when a unique winner cannot be re-read', async () => {
    const repository = repositoryWith(null);

    await expect(repository.insertSubmission(input(SUBMISSION_KEY))).rejects.toBeInstanceOf(
      StudentConflictError,
    );
  });
});
