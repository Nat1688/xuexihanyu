/**
 * Exercise domain error vocabulary (CP-02).
 *
 * Every exercise contract failure is a typed error with a stable machine code
 * and a SAFE message (no SQL/ORM text, no internal identifier beyond what the
 * caller supplied). CP-02 reuses the CP-01 content error class for
 * field/missing-data contract violations so the HTTP layer maps them uniformly,
 * but declares its OWN stable codes so exercise failures are distinguishable
 * from content-authoring failures.
 */
import { ContentValidationError } from '../../content/domain/content-errors';

/** Stable code for a missing/invalid exercise content field. */
export const EXERCISE_MISSING_CONTENT_CODE = 'EXERCISE_MISSING_CONTENT';

/**
 * Raised when an approved content item lacks the Chinese/Pinyin/meaning field a
 * requested exercise mode requires. `field` names the content field, `mode` the
 * requested exercise mode. The message is safe to surface to a client.
 */
export class ExerciseContentError extends Error {
  readonly code = EXERCISE_MISSING_CONTENT_CODE;
  constructor(
    readonly field: string,
    readonly mode: string,
  ) {
    super(`Approved content is missing "${field}" required by exercise mode ${mode}`);
    this.name = 'ExerciseContentError';
  }
}

/** Re-export the content validation error used for shape/format contract failures. */
export { ContentValidationError };
