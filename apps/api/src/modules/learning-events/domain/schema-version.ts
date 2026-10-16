/**
 * Event payload schema-version contract (CP-03).
 *
 * Every learning event is VERSIONED: it carries the payload contract version it
 * was written under, so the boundary can evolve without silently misreading old
 * evidence. This module owns the small, explicit version policy.
 *
 * Policy:
 *   - {@link CURRENT_SCHEMA_VERSION} is the version NEW events are written at.
 *   - {@link SUPPORTED_SCHEMA_VERSIONS} is the set this boundary can read and
 *     write. It is append-only history: a version is added when introduced and
 *     removed only by an explicitly approved contract change.
 *   - A version outside the supported set is rejected with a typed, safe error.
 */
import { LearningEventVersionError } from './learning-event-errors';

/** The schema version new events are written at. */
export const CURRENT_SCHEMA_VERSION = 1;

/** The schema versions this boundary can read and write (append-only history). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

/** Type guard: is `value` a supported payload schema version? */
export function isSupportedSchemaVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    SUPPORTED_SCHEMA_VERSIONS.includes(value)
  );
}

/**
 * Validate a schema version against the supported set, rejecting anything else
 * (including a missing/non-integer value) with a typed, safe error.
 */
export function validateSchemaVersion(value: unknown): number {
  if (!isSupportedSchemaVersion(value)) {
    throw new LearningEventVersionError(value);
  }
  return value;
}
