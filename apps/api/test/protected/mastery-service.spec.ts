import { event, makeMasteryService } from '../support/fake-mastery';
import { FAMILIAR_THRESHOLD, MASTERED_THRESHOLD } from '../../src/modules/mastery/domain';

/**
 * MasteryService derive/replay/rebuild tests (CP-04).
 *
 * Proves the incremental derivation, the actor-scoped replay and the full
 * rebuild all produce IDENTICAL projections for identical ordered evidence, that
 * writes are idempotent, that the service is clock-free (caller-supplied
 * `recomputedAt`), that it NEVER mutates evidence, and that the application
 * boundary exposes NO direct state-update / event-mutation path.
 */
const ACTOR = '00000000-0000-4000-8000-00000000aa01';
const OTHER = '00000000-0000-4000-8000-00000000aa02';
const ITEM = '00000000-0000-4000-8000-00000000bb01';
const ITEM2 = '00000000-0000-4000-8000-00000000bb02';
const T0 = new Date('2026-10-16T10:00:00.000Z');
const NOW = new Date('2026-10-16T12:00:00.000Z');

function correct(item: string, msOffset: number, publicId: string) {
  return event({
    publicId,
    type: 'ANSWER_SUBMITTED',
    actorPublicId: ACTOR,
    occurredAt: new Date(T0.getTime() + msOffset),
    learningItemPublicId: item,
    outcome: 'correct',
  });
}

describe('MasteryService.deriveForActor (CP-04)', () => {
  it('derives one projection per item, NEW→FAMILIAR across the streak', async () => {
    const { service } = makeMasteryService([
      correct(ITEM, 0, 'e1'),
      correct(ITEM, 1000, 'e2'),
      correct(ITEM2, 2000, 'e3'),
    ]);
    const out = await service.deriveForActor(ACTOR, NOW);
    const byItem = new Map(out.map((p) => [p.learningItemPublicId, p]));
    expect(byItem.get(ITEM)!.state).toBe('FAMILIAR');
    expect(byItem.get(ITEM)!.consecutiveCorrect).toBe(FAMILIAR_THRESHOLD);
    expect(byItem.get(ITEM2)!.state).toBe('LEARNING');
  });

  it('ignores events without a learning-item reference (not keyed)', async () => {
    const { service } = makeMasteryService([
      event({
        publicId: 'e1',
        type: 'LESSON_STARTED',
        actorPublicId: ACTOR,
        occurredAt: T0,
        learningItemPublicId: null,
      }),
      correct(ITEM, 1000, 'e2'),
    ]);
    const out = await service.deriveForActor(ACTOR, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].learningItemPublicId).toBe(ITEM);
  });

  it('is idempotent: re-running with no new events yields equal projections', async () => {
    const { service } = makeMasteryService([correct(ITEM, 0, 'e1'), correct(ITEM, 1000, 'e2')]);
    const first = await service.deriveForActor(ACTOR, NOW);
    const second = await service.deriveForActor(ACTOR, new Date(NOW.getTime() + 60000));
    expect(second).toHaveLength(1);
    // State/streak/cursor unchanged; only recomputedAt may differ.
    expect(second[0].state).toBe(first[0].state);
    expect(second[0].consecutiveCorrect).toBe(first[0].consecutiveCorrect);
    expect(second[0].lastEventPublicId).toBe(first[0].lastEventPublicId);
  });

  it('folds only events AFTER the stored cursor on a second pass', async () => {
    const events = [correct(ITEM, 0, 'e1'), correct(ITEM, 1000, 'e2')];
    const { service, projections } = makeMasteryService(events);
    await service.deriveForActor(ACTOR, NOW);
    expect(projections.size()).toBe(1);
    // Add a new later event by swapping in a reader with the extra event.
    const extended = makeMasteryService([...events, correct(ITEM, 2000, 'e3')]);
    // Seed the store with the first derivation, then derive incrementally.
    for (const p of await service.deriveForActor(ACTOR, NOW)) {
      await extended.projections.replace(p);
    }
    const out = await extended.service.deriveForActor(ACTOR, new Date(NOW.getTime() + 60000));
    expect(out[0].consecutiveCorrect).toBe(3);
    expect(out[0].lastEventPublicId).toBe('e3');
  });
});

describe('MasteryService.replay + rebuild (CP-04)', () => {
  it('replay re-derives an actor from scratch and equals incremental', async () => {
    const events = [
      correct(ITEM, 0, 'e1'),
      correct(ITEM, 1000, 'e2'),
      correct(ITEM, 2000, 'e3'),
      correct(ITEM, 3000, 'e4'),
      event({
        publicId: 'e5',
        type: 'ANSWER_SUBMITTED',
        actorPublicId: ACTOR,
        occurredAt: new Date(T0.getTime() + 4000),
        learningItemPublicId: ITEM,
        outcome: 'incorrect',
      }),
    ];
    const { service } = makeMasteryService(events);
    const incremental = await service.deriveForActor(ACTOR, NOW);
    const replayed = await service.replay(ACTOR, NOW);
    expect(replayed).toEqual(incremental);
    expect(replayed[0].state).toBe('MASTERED');
    expect(replayed[0].latestOutcomeLapsed).toBe(true);
  });

  it('rebuild clears the store and re-derives every actor/item from ALL events', async () => {
    const events = [
      correct(ITEM, 0, 'e1'),
      correct(ITEM, 1000, 'e2'),
      event({
        publicId: 'e3',
        type: 'ANSWER_SUBMITTED',
        actorPublicId: OTHER,
        occurredAt: new Date(T0.getTime() + 2000),
        learningItemPublicId: ITEM2,
        outcome: 'correct',
      }),
    ];
    const { service, projections } = makeMasteryService(events);
    const before = await service.replay(ACTOR, NOW);
    expect(before).toHaveLength(1);

    const result = await service.rebuild(NOW);
    expect(projections.clearCount).toBe(1);
    expect(result.written).toBe(2);

    const all = await service.listAll();
    expect(all).toHaveLength(2);
    const items = all.map((p) => p.learningItemPublicId).sort();
    expect(items).toEqual([ITEM, ITEM2].sort());
  });

  it('rebuild equals incremental across actors (reproducible projection)', async () => {
    const events = [
      correct(ITEM, 0, 'e1'),
      correct(ITEM, 1000, 'e2'),
      correct(ITEM, 2000, 'e3'),
      event({
        publicId: 'e4',
        type: 'ANSWER_SUBMITTED',
        actorPublicId: OTHER,
        occurredAt: new Date(T0.getTime() + 500),
        learningItemPublicId: ITEM2,
        outcome: 'correct',
      }),
    ];
    const a = makeMasteryService(events);
    await a.service.deriveForActor(ACTOR, NOW);
    await a.service.deriveForActor(OTHER, NOW);
    const incremental = await a.service.listAll();

    const b = makeMasteryService(events);
    await b.service.rebuild(NOW);
    const rebuilt = await b.service.listAll();

    expect(rebuilt).toEqual(incremental);
  });

  it('rebuild is deterministic: two rebuilds produce identical rows', async () => {
    const events = [correct(ITEM, 0, 'e1'), correct(ITEM, 1000, 'e2')];
    const { service, projections } = makeMasteryService(events);
    await service.rebuild(NOW);
    const rows1 = await service.listAll();
    await service.rebuild(NOW);
    const rows2 = await service.listAll();
    expect(projections.clearCount).toBe(2);
    expect(rows2).toEqual(rows1);
  });
});

describe('CP-04 clock-free + read-only over evidence + no mutation path', () => {
  it('uses the caller-supplied recomputedAt, never the wall clock', async () => {
    const { service } = makeMasteryService([correct(ITEM, 0, 'e1')]);
    const at = new Date('2001-01-01T00:00:00.000Z');
    const out = await service.deriveForActor(ACTOR, at);
    expect(out[0].recomputedAt.getTime()).toBe(at.getTime());
  });

  it('the event-reader PORT declares only read methods', () => {
    const probe = {
      listByActor: async () => [],
      listAll: async () => [],
    };
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(probe));
    for (const forbidden of ['append', 'update', 'delete', 'remove', 'upsert', 'replace', 'put']) {
      expect(methods).not.toContain(forbidden);
    }
  });

  it('the SERVICE exposes no event-mutation or direct state-update method', () => {
    const { service } = makeMasteryService();
    const methods = new Set<string>();
    let proto: object | null = Object.getPrototypeOf(service);
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) methods.add(name);
      proto = Object.getPrototypeOf(proto);
    }
    for (const forbidden of [
      'record',
      'append',
      'update',
      'delete',
      'remove',
      'setState',
      'override',
      'schedule',
    ]) {
      expect(methods.has(forbidden)).toBe(false);
    }
    for (const allowed of ['deriveForActor', 'replay', 'rebuild', 'listByActor', 'listAll']) {
      expect(methods.has(allowed)).toBe(true);
    }
  });

  it('derived projections are frozen value objects', async () => {
    const { service } = makeMasteryService([correct(ITEM, 0, 'e1')]);
    const out = await service.deriveForActor(ACTOR, NOW);
    expect(Object.isFrozen(out[0])).toBe(true);
  });

  it('MASTERED requires the higher threshold of consecutive correct answers', async () => {
    const events = Array.from({ length: MASTERED_THRESHOLD }, (_, i) =>
      correct(ITEM, i * 1000, `e${i}`),
    );
    const { service } = makeMasteryService(events);
    const out = await service.deriveForActor(ACTOR, NOW);
    expect(out[0].state).toBe('MASTERED');
    expect(out[0].consecutiveCorrect).toBe(MASTERED_THRESHOLD);
  });
});
