/**
 * Content domain error vocabulary (CP-01).
 *
 * Every content authoring/validation failure is expressed as a typed error with
 * a stable machine code and a SAFE message (no SQL, no ORM text, no internal
 * identifier beyond what the caller supplied). The HTTP layer maps these to the
 * ADR-005 error contract.
 *
 * `ContentValidationError` covers the hierarchy/ordering/ownership and
 * Chinese-field/item-kind contract violations required by CP-01 acceptance.
 * `ContentNotFoundError` covers a missing target on a read/mutation.
 * `ContentConflictError` covers uniqueness collisions (slug/position).
 */
export const CONTENT_VALIDATION_CODE = 'CONTENT_VALIDATION_FAILED';
export const CONTENT_NOT_FOUND_CODE = 'CONTENT_NOT_FOUND';
export const CONTENT_CONFLICT_CODE = 'CONTENT_CONFLICT';

/** Raised when a content input violates a domain contract. */
export class ContentValidationError extends Error {
  readonly code = CONTENT_VALIDATION_CODE;
  constructor(
    /** Machine-readable field/target the failure concerns (safe to surface). */
    readonly field: string,
    reason: string,
  ) {
    super(`Invalid content ${field}: ${reason}`);
    this.name = 'ContentValidationError';
  }
}

/** Raised when a referenced content node does not exist. */
export class ContentNotFoundError extends Error {
  readonly code = CONTENT_NOT_FOUND_CODE;
  constructor(readonly resource: string) {
    super(`${resource} not found`);
    this.name = 'ContentNotFoundError';
  }
}

/** Raised when a uniqueness constraint (slug/position) would be violated. */
export class ContentConflictError extends Error {
  readonly code = CONTENT_CONFLICT_CODE;
  constructor(reason: string) {
    super(`Content conflict: ${reason}`);
    this.name = 'ContentConflictError';
  }
}
