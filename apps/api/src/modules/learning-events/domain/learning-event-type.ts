/**
 * Learning-event type vocabulary (CP-03).
 *
 * The INITIAL, CLOSED set of interaction evidence kinds. This mirrors the
 * `LearningEventType` Prisma enum 1:1. There is intentionally NO free-form or
 * untyped event: a new event kind requires a separately approved contract and
 * is added here explicitly.
 *
 * The vocabulary is EVIDENCE-ONLY: each kind records that an interaction
 * happened, never a derived judgement (mastery, score, scheduling) — that is
 * CP-04 and is deliberately absent.
 */
import { LearningEventUnknownTypeError } from './learning-event-errors';

export const LEARNING_EVENT_TYPES = [
  'LESSON_STARTED',
  'LESSON_COMPLETED',
  'EXERCISE_PRESENTED',
  'ANSWER_SUBMITTED',
  'EXERCISE_COMPLETED',
  'REVIEW_ACTIVITY',
] as const;

export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

/** Type guard: is `value` an approved CP-03 event type? */
export function isLearningEventType(value: unknown): value is LearningEventType {
  return typeof value === 'string' && (LEARNING_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Validate and return an event type, rejecting any unknown value with a typed,
 * safe error. The offending value is NOT interpolated into the message.
 */
export function validateEventType(value: unknown): LearningEventType {
  if (!isLearningEventType(value)) {
    throw new LearningEventUnknownTypeError(value);
  }
  return value;
}
