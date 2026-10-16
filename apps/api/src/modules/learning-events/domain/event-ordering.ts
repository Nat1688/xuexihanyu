/**
 * Event ordering (CP-03).
 *
 * Events are ordered by `occurredAt` (a UTC instant) with a STABLE tiebreak on
 * the public id, so two events that share an instant still come out in a
 * deterministic, reproducible order. The comparison is pure and clock-free: it
 * only reads the fields it is given.
 *
 * Timestamps are UTC instants. This module asserts instants are real, finite
 * times; it never reads the system clock.
 */
import { LearningEventValidationError } from './learning-event-errors';

/** The minimal shape ordering needs (a view of any event record). */
export interface OrderableEvent {
  readonly publicId: string;
  readonly occurredAt: Date;
}

/**
 * Validate an `occurredAt` instant. Accepts a `Date` whose time is a finite,
 * valid epoch value. A non-Date, an invalid Date, or a non-finite time is a
 * typed contract error. The boundary stores UTC; naive local times are the
 * caller's responsibility to convert before they reach here.
 */
export function validateOccurredAt(value: unknown): Date {
  if (!(value instanceof Date)) {
    throw new LearningEventValidationError('occurredAt', 'must be a Date instant');
  }
  const time = value.getTime();
  if (!Number.isFinite(time)) {
    throw new LearningEventValidationError('occurredAt', 'must be a valid instant');
  }
  return value;
}

/**
 * Deterministic ordering for two orderable events: ascending `occurredAt`, then
 * ascending `publicId` as the stable tiebreak. Safe to pass to `Array.sort`.
 */
export function compareEvents(a: OrderableEvent, b: OrderableEvent): number {
  const at = a.occurredAt.getTime();
  const bt = b.occurredAt.getTime();
  if (at !== bt) return at - bt;
  if (a.publicId < b.publicId) return -1;
  if (a.publicId > b.publicId) return 1;
  return 0;
}

/**
 * Return a NEW array of events in deterministic order (ascending). Pure: the
 * input array is not mutated.
 */
export function orderEvents<T extends OrderableEvent>(events: readonly T[]): T[] {
  return [...events].sort(compareEvents);
}
