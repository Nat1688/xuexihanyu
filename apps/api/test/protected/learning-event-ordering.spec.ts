import {
  compareEvents,
  orderEvents,
  validateOccurredAt,
  LearningEventValidationError,
  LEARNING_EVENT_VALIDATION_CODE,
  type OrderableEvent,
} from '../../src/modules/learning-events/domain';

/**
 * Learning-event ordering + determinism tests (CP-03).
 *
 * Proves ordering is (occurredAt, stable publicId): it is total, deterministic,
 * independent of input order, and clock-free. Also proves `occurredAt` must be a
 * real UTC instant.
 */
function ev(publicId: string, iso: string): OrderableEvent {
  return { publicId, occurredAt: new Date(iso) };
}

describe('orderEvents / compareEvents — deterministic ordering (CP-03)', () => {
  it('orders ascending by occurredAt', () => {
    const a = ev('aaa', '2026-10-16T10:00:00.000Z');
    const b = ev('bbb', '2026-10-16T11:00:00.000Z');
    expect(compareEvents(a, b)).toBeLessThan(0);
    expect(compareEvents(b, a)).toBeGreaterThan(0);
    expect(orderEvents([b, a]).map((e) => e.publicId)).toEqual(['aaa', 'bbb']);
  });

  it('breaks ties on instant by ascending stable publicId', () => {
    const same = '2026-10-16T10:00:00.000Z';
    const a = ev('z-id', same);
    const b = ev('a-id', same);
    expect(orderEvents([a, b]).map((e) => e.publicId)).toEqual(['a-id', 'z-id']);
    expect(compareEvents(a, a)).toBe(0);
  });

  it('is independent of input order (deterministic)', () => {
    const events = [
      ev('c', '2026-10-16T12:00:00.000Z'),
      ev('a', '2026-10-16T10:00:00.000Z'),
      ev('b', '2026-10-16T11:00:00.000Z'),
    ];
    const forward = orderEvents(events).map((e) => e.publicId);
    const reversed = orderEvents([...events].reverse()).map((e) => e.publicId);
    expect(forward).toEqual(['a', 'b', 'c']);
    expect(reversed).toEqual(forward);
  });

  it('does not mutate the input array', () => {
    const events = [ev('b', '2026-10-16T11:00:00.000Z'), ev('a', '2026-10-16T10:00:00.000Z')];
    const copy = [...events];
    orderEvents(events);
    expect(events).toEqual(copy);
  });
});

describe('validateOccurredAt (CP-03)', () => {
  it('accepts a valid Date instant', () => {
    const d = new Date('2026-10-16T10:00:00.000Z');
    expect(validateOccurredAt(d)).toBe(d);
  });

  it('rejects a non-Date and an invalid Date with a typed safe error', () => {
    for (const value of ['2026-10-16T10:00:00.000Z', 1234567890, null, undefined]) {
      expect(() => validateOccurredAt(value)).toThrow(LearningEventValidationError);
    }
    expect(() => validateOccurredAt(new Date('not-a-date'))).toThrow(LearningEventValidationError);
  });

  it('reports the validation code with a field-named message', () => {
    try {
      validateOccurredAt('nope');
      throw new Error('expected throw');
    } catch (error) {
      const e = error as LearningEventValidationError;
      expect(e.code).toBe(LEARNING_EVENT_VALIDATION_CODE);
      expect(e.message).toContain('occurredAt');
    }
  });
});
