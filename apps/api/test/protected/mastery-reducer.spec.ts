import {
  applyEvent,
  computeDueAt,
  deriveProjection,
  FAMILIAR_THRESHOLD,
  MASTERED_THRESHOLD,
  MasteryRuleVersionError,
  MasteryUnkeyableEventError,
  MasteryUnknownStateError,
  REVIEW_INTERVAL_MS,
  LAPSE_REVIEW_INTERVAL_MS,
  MASTERY_STATE_RANK,
  compareMasteryStates,
  groupKeyedEvents,
  initialProjection,
  isKeyedEvent,
  isMasteryState,
  maxMasteryState,
  reviewIntervalMs,
  validateMasteryState,
  validateRuleVersion,
  type MasteryEvidenceEvent,
} from '../../src/modules/mastery/domain';

const ACTOR = '00000000-0000-4000-8000-00000000aa01';
const ITEM = '00000000-0000-4000-8000-00000000bb01';
const ITEM2 = '00000000-0000-4000-8000-00000000bb02';
const T0 = new Date('2026-10-16T10:00:00.000Z');

let counter = 0;
function ev(
  type: MasteryEvidenceEvent['type'],
  occurredAt: Date,
  opts: { item?: string | null; outcome?: string; publicId?: string; actor?: string } = {},
): MasteryEvidenceEvent {
  const metadata: Record<string, string> = {};
  if (opts.outcome) metadata.outcome = opts.outcome;
  return {
    publicId: opts.publicId ?? `evt-${String(++counter).padStart(6, '0')}`,
    type,
    occurredAt,
    refs: { learningItemPublicId: opts.item === undefined ? ITEM : opts.item },
    metadata,
    actorPublicId: opts.actor ?? ACTOR,
  } as MasteryEvidenceEvent & { actorPublicId: string };
}

describe('mastery state vocabulary (CP-04)', () => {
  it('declares EXACTLY NEW/LEARNING/FAMILIAR/MASTERED, ranks monotone', () => {
    expect(Object.keys(MASTERY_STATE_RANK)).toEqual(['NEW', 'LEARNING', 'FAMILIAR', 'MASTERED']);
    expect(MASTERY_STATE_RANK.NEW).toBeLessThan(MASTERY_STATE_RANK.LEARNING);
    expect(MASTERY_STATE_RANK.LEARNING).toBeLessThan(MASTERY_STATE_RANK.FAMILIAR);
    expect(MASTERY_STATE_RANK.FAMILIAR).toBeLessThan(MASTERY_STATE_RANK.MASTERED);
  });

  it('validates states and rejects unknown ones with a safe error', () => {
    expect(isMasteryState('MASTERED')).toBe(true);
    expect(isMasteryState('EXPERT')).toBe(false);
    expect(validateMasteryState('NEW')).toBe('NEW');
    expect(() => validateMasteryState('EXPERT')).toThrow(MasteryUnknownStateError);
    try {
      validateMasteryState('EXPERT-SECRET');
    } catch (err) {
      expect((err as Error).message).not.toContain('EXPERT-SECRET');
    }
  });

  it('compares and takes the max deterministically', () => {
    expect(compareMasteryStates('NEW', 'MASTERED')).toBeLessThan(0);
    expect(maxMasteryState('LEARNING', 'FAMILIAR')).toBe('FAMILIAR');
    expect(maxMasteryState('MASTERED', 'NEW')).toBe('MASTERED');
  });
});

describe('mastery rule version (CP-04)', () => {
  it('accepts supported versions and rejects others safely', () => {
    expect(validateRuleVersion(1)).toBe(1);
    expect(() => validateRuleVersion(999)).toThrow(MasteryRuleVersionError);
    try {
      validateRuleVersion(999);
    } catch (err) {
      expect(err).toBeInstanceOf(MasteryRuleVersionError);
    }
  });
});

describe('deterministic review schedule (CP-04)', () => {
  it('has the approved interval table', () => {
    expect(REVIEW_INTERVAL_MS.NEW).toBe(0);
    expect(REVIEW_INTERVAL_MS.LEARNING).toBe(4 * 60 * 60 * 1000);
    expect(REVIEW_INTERVAL_MS.FAMILIAR).toBe(24 * 60 * 60 * 1000);
    expect(REVIEW_INTERVAL_MS.MASTERED).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('steps a lapsed MASTERED item down to the FAMILIAR interval', () => {
    expect(reviewIntervalMs({ state: 'MASTERED', asOf: T0, latestOutcomeLapsed: false })).toBe(
      REVIEW_INTERVAL_MS.MASTERED,
    );
    expect(reviewIntervalMs({ state: 'MASTERED', asOf: T0, latestOutcomeLapsed: true })).toBe(
      LAPSE_REVIEW_INTERVAL_MS,
    );
  });

  it('computes due-at purely from (state, asOf) — no clock, no randomness', () => {
    const a = computeDueAt({ state: 'LEARNING', asOf: T0, latestOutcomeLapsed: false });
    const b = computeDueAt({ state: 'LEARNING', asOf: T0, latestOutcomeLapsed: false });
    expect(a.getTime()).toBe(b.getTime());
    expect(a.getTime()).toBe(T0.getTime() + REVIEW_INTERVAL_MS.LEARNING);
    // Input is not mutated.
    expect(T0.toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });

  it('NEW is due immediately (interval 0)', () => {
    expect(computeDueAt({ state: 'NEW', asOf: T0, latestOutcomeLapsed: false }).getTime()).toBe(
      T0.getTime(),
    );
  });
});

describe('mastery transition reducer (CP-04)', () => {
  it('starts at NEW and advances NEW→LEARNING on first correct answer', () => {
    expect(initialProjection(ACTOR, ITEM).state).toBe('NEW');
    const p = deriveProjection(
      ACTOR,
      ITEM,
      [ev('ANSWER_SUBMITTED', T0, { outcome: 'correct' })],
      new Date('2026-10-16T10:00:10.000Z'),
    );
    expect(p.state).toBe('LEARNING');
    expect(p.consecutiveCorrect).toBe(1);
  });

  it('advances to FAMILIAR at the threshold and MASTERED at the higher threshold', () => {
    const events = Array.from({ length: MASTERED_THRESHOLD }, (_, i) =>
      ev('ANSWER_SUBMITTED', new Date(T0.getTime() + i * 1000), { outcome: 'correct' }),
    );
    const atFamiliar = deriveProjection(ACTOR, ITEM, events.slice(0, FAMILIAR_THRESHOLD), T0);
    expect(atFamiliar.state).toBe('FAMILIAR');
    const atMastered = deriveProjection(ACTOR, ITEM, events, T0);
    expect(atMastered.state).toBe('MASTERED');
    expect(atMastered.consecutiveCorrect).toBe(MASTERED_THRESHOLD);
  });

  it('a lapse resets the streak and records lapsed (state not lowered in v1)', () => {
    const events = [
      ...Array.from({ length: MASTERED_THRESHOLD }, (_, i) =>
        ev('ANSWER_SUBMITTED', new Date(T0.getTime() + i * 1000), { outcome: 'correct' }),
      ),
      ev('ANSWER_SUBMITTED', new Date(T0.getTime() + 9999), { outcome: 'incorrect' }),
    ];
    const p = deriveProjection(ACTOR, ITEM, events, T0);
    expect(p.consecutiveCorrect).toBe(0);
    expect(p.latestOutcomeLapsed).toBe(true);
    expect(p.state).toBe('MASTERED');
    // Scheduling step-down: due sooner than an un-lapsed MASTERED item.
    expect(
      reviewIntervalMs({ state: p.state, asOf: p.lastEventAt!, latestOutcomeLapsed: true }),
    ).toBe(LAPSE_REVIEW_INTERVAL_MS);
  });

  it('EXERCISE_COMPLETED advances NEW→LEARNING but not further', () => {
    const p = deriveProjection(ACTOR, ITEM, [ev('EXERCISE_COMPLETED', T0)], T0);
    expect(p.state).toBe('LEARNING');
    expect(p.consecutiveCorrect).toBe(0);
  });

  it('LESSON/PRESENTED/REVIEW events move the anchor but never the state', () => {
    const p = deriveProjection(
      ACTOR,
      ITEM,
      [
        ev('LESSON_STARTED', T0),
        ev('EXERCISE_PRESENTED', new Date(T0.getTime() + 1000)),
        ev('REVIEW_ACTIVITY', new Date(T0.getTime() + 2000)),
      ],
      new Date('2026-10-16T10:01:00.000Z'),
    );
    expect(p.state).toBe('NEW');
    // Anchor is the latest folded event.
    expect(p.lastEventAt!.getTime()).toBe(T0.getTime() + 2000);
  });

  it('applyEvent is pure: neither input nor event is mutated', () => {
    const base = initialProjection(ACTOR, ITEM);
    const before = { ...base };
    const e = ev('ANSWER_SUBMITTED', T0, { outcome: 'correct' });
    const next = applyEvent(base, e, T0);
    expect(base.state).toBe('NEW');
    expect(base).toEqual(before);
    expect(next.state).toBe('LEARNING');
    expect(base).not.toBe(next);
  });

  it('applyEvent rejects an unkeyed or mismatched event', () => {
    const base = initialProjection(ACTOR, ITEM);
    expect(() => applyEvent(base, ev('LESSON_STARTED', T0, { item: null }), T0)).toThrow(
      MasteryUnkeyableEventError,
    );
    expect(() => applyEvent(base, ev('LESSON_STARTED', T0, { item: ITEM2 }), T0)).toThrow();
  });

  it('groupKeyedEvents excludes unkeyed events and preserves per-group order', () => {
    const events = [
      ev('LESSON_STARTED', new Date(T0.getTime() + 0), { item: null }),
      ev('ANSWER_SUBMITTED', new Date(T0.getTime() + 1000), { outcome: 'correct' }),
      ev('ANSWER_SUBMITTED', new Date(T0.getTime() + 2000), { item: ITEM2, outcome: 'correct' }),
      ev('ANSWER_SUBMITTED', new Date(T0.getTime() + 3000), { outcome: 'correct' }),
    ];
    const groups = groupKeyedEvents(events);
    expect(groups.size).toBe(2);
    const item1 = groups.get(`${ACTOR}\u0000${ITEM}`)!;
    expect(item1.events).toHaveLength(2);
    expect(item1.events[0].occurredAt.getTime()).toBe(T0.getTime() + 1000);
    expect(item1.events[1].occurredAt.getTime()).toBe(T0.getTime() + 3000);
  });

  it('isKeyedEvent reflects a learning-item reference', () => {
    expect(isKeyedEvent(ev('LESSON_STARTED', T0))).toBe(true);
    expect(isKeyedEvent(ev('LESSON_STARTED', T0, { item: null }))).toBe(false);
  });

  it('stamps recomputedAt on the derived projection and derives dueAt from the anchor', () => {
    const at = new Date('2026-10-16T10:05:00.000Z');
    const p = deriveProjection(
      ACTOR,
      ITEM,
      [ev('ANSWER_SUBMITTED', T0, { outcome: 'correct' })],
      at,
    );
    expect(p.recomputedAt.getTime()).toBe(at.getTime());
    expect(p.dueAt.getTime()).toBe(T0.getTime() + REVIEW_INTERVAL_MS.LEARNING);
  });
});
