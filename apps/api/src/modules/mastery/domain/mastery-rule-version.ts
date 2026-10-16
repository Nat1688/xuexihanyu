/**
 * Mastery rule-version contract (CP-04).
 *
 * The mastery projection is VERSIONED: every derived row records the rule set it
 * was produced under, so the rules can evolve without silently misreading old
 * projections. This module owns the small, explicit version policy.
 *
 * Policy:
 *   - {@link CURRENT_RULE_VERSION} is the rule version NEW/REBUILT projections
 *     are written at.
 *   - {@link SUPPORTED_RULE_VERSIONS} is the set this boundary can derive and
 *     read. It is append-only history: a version is added when introduced and
 *     removed only by an explicitly approved contract change.
 *   - A version outside the supported set is rejected with a typed, safe error.
 *
 * A rule change is a NEW version plus a deterministic rebuild path; the stored
 * source-event cursor lets a rebuild re-derive the projection from immutable
 * evidence without touching events.
 */
import { MasteryRuleVersionError } from './mastery-errors';

/** The rule version new/derived projections are written at. */
export const CURRENT_RULE_VERSION = 1;

/** The rule versions this boundary can derive and read (append-only history). */
export const SUPPORTED_RULE_VERSIONS: readonly number[] = [1];

/** Type guard: is `value` a supported mastery rule version? */
export function isSupportedRuleVersion(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && SUPPORTED_RULE_VERSIONS.includes(value)
  );
}

/**
 * Validate a rule version against the supported set, rejecting anything else
 * (including a missing/non-integer value) with a typed, safe error.
 */
export function validateRuleVersion(value: unknown): number {
  if (!isSupportedRuleVersion(value)) {
    throw new MasteryRuleVersionError(value);
  }
  return value;
}
