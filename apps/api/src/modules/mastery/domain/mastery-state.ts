/**
 * Mastery state vocabulary (CP-04).
 *
 * The INITIAL, CLOSED set of derived learning states, exactly as approved by the
 * Owner: `NEW` → `LEARNING` → `FAMILIAR` → `MASTERED`. This mirrors the CP-04
 * contract 1:1 and there is intentionally NO free-form state: a new state
 * requires a separately approved contract and is added here explicitly.
 *
 * The vocabulary is derived-only: a state is a PURE function of an item's
 * ordered evidence under a fixed rule version. It never carries a raw score,
 * a random schedule or a manual override — those are forbidden by the contract.
 */
import { MasteryUnknownStateError } from './mastery-errors';

/** The closed mastery-state vocabulary, ordered from least to most proficient. */
export const MASTERY_STATES = ['NEW', 'LEARNING', 'FAMILIAR', 'MASTERED'] as const;

export type MasteryState = (typeof MASTERY_STATES)[number];

/**
 * Ordinal rank of each state on the monotone proficiency scale. Used to compare
 * progression; the scale is total and deterministic.
 */
export const MASTERY_STATE_RANK: Readonly<Record<MasteryState, number>> = Object.freeze({
  NEW: 0,
  LEARNING: 1,
  FAMILIAR: 2,
  MASTERED: 3,
});

/** Type guard: is `value` an approved CP-04 mastery state? */
export function isMasteryState(value: unknown): value is MasteryState {
  return typeof value === 'string' && (MASTERY_STATES as readonly string[]).includes(value);
}

/**
 * Validate and return a mastery state, rejecting any unknown value with a
 * typed, safe error. The offending value is NOT interpolated into the message.
 */
export function validateMasteryState(value: unknown): MasteryState {
  if (!isMasteryState(value)) {
    throw new MasteryUnknownStateError(value);
  }
  return value;
}

/** Deterministic comparison of two states by proficiency rank. */
export function compareMasteryStates(a: MasteryState, b: MasteryState): number {
  return MASTERY_STATE_RANK[a] - MASTERY_STATE_RANK[b];
}

/**
 * The higher (more proficient) of two states. Ties return the first argument.
 * Pure and total — the single place progression is decided.
 */
export function maxMasteryState(a: MasteryState, b: MasteryState): MasteryState {
  return MASTERY_STATE_RANK[a] >= MASTERY_STATE_RANK[b] ? a : b;
}
