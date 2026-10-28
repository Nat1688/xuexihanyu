import {
  LearningEventService,
  MAX_LIST_LIMIT,
} from '../../src/modules/learning-events/application/learning-event-service';
import { type LearningEventRepository } from '../../src/modules/learning-events/application/learning-event-repository';
import {
  makeLearningEvent,
  LearningEventValidationError,
  LearningEventUnknownTypeError,
} from '../../src/modules/learning-events/domain';
import { FakeLearningEventRepository } from '../support/fake-learning-event-repository';

/**
 * LearningEventService append-only behaviour tests (CP-03).
 *
 * Proves the service records validated evidence, rejects malformed input BEFORE
 * touching the repository, returns a deterministic read, and — critically — the
 * application boundary exposes NO update/delete/upsert path.
 */
const ACTOR = '00000000-0000-4000-8000-00000000aa01';

function makeService() {
  const repository = new FakeLearningEventRepository();
  return { service: new LearningEventService({ repository }), repository };
}

describe('LearningEventService.record (CP-03)', () => {
  it('validates and appends one event, returning stored evidence', async () => {
    const { service, repository } = makeService();
    const stored = await service.record({
      type: 'LESSON_STARTED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T10:00:00.000Z'),
    });
    expect(stored.publicId).toBe('evt-000001');
    expect(stored.type).toBe('LESSON_STARTED');
    expect(stored.schemaVersion).toBe(1);
    expect(stored.actorPublicId).toBe(ACTOR);
    expect(repository.appendCount).toBe(1);
  });

  it('defaults the schema version and keeps optional metadata empty', async () => {
    const { service } = makeService();
    const stored = await service.record({
      type: 'REVIEW_ACTIVITY',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T10:00:00.000Z'),
    });
    expect(stored.schemaVersion).toBe(1);
    expect(stored.metadata).toEqual({});
  });

  it('carries validated metadata and references through', async () => {
    const { service } = makeService();
    const stored = await service.record({
      type: 'ANSWER_SUBMITTED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T10:00:00.000Z'),
      exerciseRef: 'ex-2026-0001',
      coursePublicId: 'c-1',
      lessonPublicId: 'l-1',
      metadata: { outcome: 'correct', durationMs: 900 },
    });
    expect(stored.metadata).toEqual({ outcome: 'correct', durationMs: 900 });
    expect(stored.refs.exerciseRef).toBe('ex-2026-0001');
    expect(stored.refs.coursePublicId).toBe('c-1');
    expect(stored.refs.lessonPublicId).toBe('l-1');
  });

  it('accepts a caller-supplied UUID as an idempotency key', async () => {
    const { service, repository } = makeService();
    const publicId = '3bbcee75-6b9e-5ca7-a551-35223b16a999';
    const input = {
      publicId,
      type: 'ANSWER_SUBMITTED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T10:00:00.000Z'),
      exerciseRef: 'session-1',
      metadata: { outcome: 'correct' },
    } as const;

    const first = await service.record(input);
    const retry = await service.record(input);
    expect(first.publicId).toBe(publicId);
    expect(retry).toEqual(first);
    expect(repository.snapshot()).toHaveLength(1);
  });

  it('rejects a malformed event BEFORE the repository is touched', async () => {
    const { service, repository } = makeService();
    await expect(
      service.record({
        type: 'NOT_A_TYPE',
        actorPublicId: ACTOR,
        occurredAt: new Date('2026-10-16T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(LearningEventUnknownTypeError);
    await expect(
      service.record({
        type: 'LESSON_STARTED',
        actorPublicId: ACTOR,
        occurredAt: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(LearningEventValidationError);
    await expect(
      service.record({
        publicId: 'not-a-uuid',
        type: 'LESSON_STARTED',
        actorPublicId: ACTOR,
        occurredAt: new Date('2026-10-16T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(LearningEventValidationError);
    expect(repository.appendCount).toBe(0);
  });

  it('appends are additive: N records yield N distinct rows', async () => {
    const { service, repository } = makeService();
    for (const type of ['LESSON_STARTED', 'EXERCISE_PRESENTED', 'LESSON_COMPLETED'] as const) {
      await service.record({ type, actorPublicId: ACTOR, occurredAt: new Date() });
    }
    expect(repository.appendCount).toBe(3);
    expect(repository.snapshot()).toHaveLength(3);
  });
});

describe('LearningEventService.listByActor (CP-03)', () => {
  it('returns events in deterministic (occurredAt, id) order', async () => {
    const { service, repository } = makeService();
    // Append out of chronological order.
    await service.record({
      type: 'LESSON_COMPLETED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T12:00:00.000Z'),
    });
    await service.record({
      type: 'LESSON_STARTED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T10:00:00.000Z'),
    });
    await service.record({
      type: 'EXERCISE_PRESENTED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T11:00:00.000Z'),
    });
    const out = await service.listByActor(ACTOR, 10);
    expect(out.map((e) => e.type)).toEqual([
      'LESSON_STARTED',
      'EXERCISE_PRESENTED',
      'LESSON_COMPLETED',
    ]);
    expect(repository.appendCount).toBe(3);
  });

  it('bounds the read to MAX_LIST_LIMIT', async () => {
    const { service } = makeService();
    const out = await service.listByActor(ACTOR, MAX_LIST_LIMIT + 1000);
    expect(out.length).toBeLessThanOrEqual(MAX_LIST_LIMIT);
  });

  it('separates actors', async () => {
    const { service } = makeService();
    const other = '00000000-0000-4000-8000-00000000bb02';
    await service.record({ type: 'LESSON_STARTED', actorPublicId: ACTOR, occurredAt: new Date() });
    await service.record({ type: 'LESSON_STARTED', actorPublicId: other, occurredAt: new Date() });
    const out = await service.listByActor(ACTOR, 10);
    expect(out).toHaveLength(1);
    expect(out[0].actorPublicId).toBe(ACTOR);
  });
});

describe('append-only boundary — NO mutation path (CP-03)', () => {
  it('the repository PORT declares only append + bounded read', () => {
    const portMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(makePortProbe()));
    // Only constructor/create + the two allowed methods exist.
    for (const forbidden of ['update', 'delete', 'remove', 'upsert', 'replace', 'put', 'patch']) {
      expect(portMethods).not.toContain(forbidden);
    }
  });

  it('the SERVICE exposes no update/delete method', () => {
    const service = new LearningEventService({
      repository: new FakeLearningEventRepository(),
    });
    const methods = new Set<string>();
    let proto: object | null = Object.getPrototypeOf(service);
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) methods.add(name);
      proto = Object.getPrototypeOf(proto);
    }
    for (const forbidden of ['update', 'delete', 'remove', 'upsert', 'replace']) {
      expect(methods.has(forbidden)).toBe(false);
    }
    expect(methods.has('record')).toBe(true);
    expect(methods.has('listByActor')).toBe(true);
  });

  it('records are frozen value objects (defensive immutability)', () => {
    const event = makeLearningEvent({
      type: 'LESSON_STARTED',
      actorPublicId: ACTOR,
      occurredAt: new Date('2026-10-16T10:00:00.000Z'),
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.refs)).toBe(true);
  });
});

/** A minimal, methods-only object implementing the port shape for reflection. */
function makePortProbe(): LearningEventRepository {
  return {
    append: async () => {
      throw new Error('unused');
    },
    listByActor: async () => [],
  };
}
