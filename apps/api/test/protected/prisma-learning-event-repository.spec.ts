import { Prisma } from '@prisma/client';

import {
  LearningEventConflictError,
  makeLearningEvent,
} from '../../src/modules/learning-events/domain';
import { PrismaLearningEventRepository } from '../../src/modules/learning-events/infrastructure/prisma-learning-event.repository';

const ACTOR_PUBLIC_ID = '00000000-0000-4000-8000-00000000aa01';
const EVENT_PUBLIC_ID = '3bbcee75-6b9e-5ca7-a551-35223b16a999';
const OCCURRED_AT = new Date('2026-10-17T10:00:00.000Z');
const CREATED_AT = new Date('2026-10-17T10:00:01.000Z');

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['public_id'] },
  });
}

function harness(existingMetadata: object = { outcome: 'correct' }) {
  const duplicate = uniqueViolation();
  const row = {
    publicId: EVENT_PUBLIC_ID,
    type: 'ANSWER_SUBMITTED',
    schemaVersion: 1,
    actorId: 'actor-internal',
    courseId: null,
    unitId: null,
    lessonId: null,
    learningItemId: null,
    exerciseRef: 'session-1',
    occurredAt: OCCURRED_AT,
    metadata: existingMetadata,
    createdAt: CREATED_AT,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, string> }) =>
        where.publicId ? { id: 'actor-internal' } : { publicId: ACTOR_PUBLIC_ID },
      ),
    },
    course: { findUnique: jest.fn() },
    unit: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    learningItem: { findUnique: jest.fn() },
    learningEvent: {
      create: jest.fn(async () => Promise.reject(duplicate)),
      findUnique: jest.fn(async () => row),
    },
  };
  return {
    duplicate,
    prisma,
    repository: new PrismaLearningEventRepository(prisma as never),
  };
}

function event() {
  return makeLearningEvent({
    publicId: EVENT_PUBLIC_ID,
    type: 'ANSWER_SUBMITTED',
    actorPublicId: ACTOR_PUBLIC_ID,
    occurredAt: OCCURRED_AT,
    exerciseRef: 'session-1',
    metadata: { outcome: 'correct' },
  });
}

describe('PrismaLearningEventRepository caller-supplied public id', () => {
  it('returns the existing semantically identical event after a concurrent unique race', async () => {
    const { prisma, repository } = harness();

    const stored = await repository.append(event());

    expect(stored.publicId).toBe(EVENT_PUBLIC_ID);
    expect(stored.metadata).toEqual({ outcome: 'correct' });
    expect(prisma.learningEvent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: EVENT_PUBLIC_ID } }),
    );
  });

  it('does not treat a public-id collision with different evidence as idempotent', async () => {
    const { repository } = harness({ outcome: 'incorrect' });

    await expect(repository.append(event())).rejects.toBeInstanceOf(LearningEventConflictError);
  });
});
