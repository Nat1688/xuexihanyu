/**
 * Deterministic review scheduling (CP-04).
 *
 * Review timing is a PURE function of (state, rule inputs). There is NO random
 * jitter, NO clock read and NO AI: the same state and the same "as of" instant
 * always produce the same due-at instant. This is the contract's "deterministic
 * review interval functions" requirement, made explicit and testable.
 *
 * Intervals are expressed in whole milliseconds so the arithmetic is exact and
 * reproducible. The schedule is derived from the CURRENT mastery state only, so
 * a rebuild from the same ordered evidence yields the same due time.
 *
 * Interval policy (rule version 1):
 *
 *   state     | base interval | rationale
 *   ----------|---------------|----------------------------------------------
 *   NEW       | 0             | never studied → due immediately
 *   LEARNING  | 4 hours       | short consolidation loop
 *   FAMILIAR  | 1 day         | spaced but still frequent
 *   MASTERED  | 7 days        | long retention interval
 *
 * A mastered item whose evidence shows a recent incorrect answer is treated at
 * the FAMILIAR interval (a deterministic lapse step-down) so renewed difficulty
 * is revisited sooner — this is still a pure function of the evidence, never a
 * random or model-driven value.
 */
import { type MasteryState } from './mastery-state';

/** Milliseconds per minute (exact). */
export const MS_PER_MINUTE = 60_000;
/** Milliseconds per hour (exact). */
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
/** Milliseconds per day (exact). */
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Base review interval (ms) per mastery state — the deterministic schedule
 * table. Frozen so it cannot be mutated at runtime.
 */
export const REVIEW_INTERVAL_MS: Readonly<Record<MasteryState, number>> = Object.freeze({
  NEW: 0,
  LEARNING: 4 * MS_PER_HOUR,
  FAMILIAR: 1 * MS_PER_DAY,
  MASTERED: 7 * MS_PER_DAY,
});

/**
 * The interval applied when a MASTERED item's latest evidence is a lapse
 * (an incorrect outcome), stepping it back to the FAMILIAR cadence.
 */
export const LAPSE_REVIEW_INTERVAL_MS = REVIEW_INTERVAL_MS.FAMILIAR;

/** Inputs the review scheduler consumes — all explicit rule inputs. */
export interface ReviewScheduleInput {
  readonly state: MasteryState;
  /** The instant the schedule is anchored to (the latest evidence instant). */
  readonly asOf: Date;
  /**
   * Whether the most recent evidence for this item is a lapse (an incorrect
   * evaluation outcome). A lapse steps a MASTERED interval down to FAMILIAR.
   */
  readonly latestOutcomeLapsed: boolean;
}

/**
 * The deterministic review interval (ms) for a state, honoring the lapse
 * step-down for MASTERED items. Pure.
 */
export function reviewIntervalMs(input: ReviewScheduleInput): number {
  if (input.state === 'MASTERED' && input.latestOutcomeLapsed) {
    return LAPSE_REVIEW_INTERVAL_MS;
  }
  return REVIEW_INTERVAL_MS[input.state];
}

/**
 * The deterministic due-at instant: `asOf` plus the state's review interval.
 * Returns a NEW Date (never mutates the input). Pure and clock-free — the
 * caller supplies `asOf` from evidence, never `Date.now()`.
 */
export function computeDueAt(input: ReviewScheduleInput): Date {
  return new Date(input.asOf.getTime() + reviewIntervalMs(input));
}

/** Is the item due at `at` (due-at instant at or before `at`)? Pure. */
export function isDueAt(dueAt: Date, at: Date): boolean {
  return dueAt.getTime() <= at.getTime();
}
