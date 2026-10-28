/**
 * Learning-event domain error vocabulary (CP-03).
 *
 * Every event contract failure is a typed error with a STABLE machine code and
 * a SAFE message (no SQL/ORM text, no internal identifier beyond what the
 * caller supplied, and NEVER the offending raw value — a rejected payload may
 * contain a secret, so the message names only the FIELD). CP-03 declares its
 * own codes so event failures are distinguishable from content/exercise
 * failures.
 */

/** Stable code for an invalid/unknown learning-event type. */
export const LEARNING_EVENT_UNKNOWN_TYPE_CODE = 'LEARNING_EVENT_UNKNOWN_TYPE';

/** Stable code for an unsupported payload schema version. */
export const LEARNING_EVENT_UNSUPPORTED_VERSION_CODE = 'LEARNING_EVENT_UNSUPPORTED_VERSION';

/** Stable code for a malformed/invalid event field. */
export const LEARNING_EVENT_VALIDATION_CODE = 'LEARNING_EVENT_VALIDATION';

/** Stable code for metadata that violates the allow-list or size limits. */
export const LEARNING_EVENT_METADATA_CODE = 'LEARNING_EVENT_METADATA';

/** Stable code for an idempotency-key collision with different evidence. */
export const LEARNING_EVENT_CONFLICT_CODE = 'LEARNING_EVENT_CONFLICT';

/**
 * Raised when an event type outside the closed {@link LearningEventType}
 * vocabulary is supplied. `value` is retained for server-side diagnostics but
 * NEVER interpolated into the (safe) message.
 */
export class LearningEventUnknownTypeError extends Error {
  readonly code = LEARNING_EVENT_UNKNOWN_TYPE_CODE;
  constructor(readonly value: unknown) {
    super('Unsupported learning event type');
    this.name = 'LearningEventUnknownTypeError';
  }
}

/**
 * Raised when the requested payload schema version is not one this boundary can
 * read/write. `version` is a number (safe to surface); the message stays fixed.
 */
export class LearningEventVersionError extends Error {
  readonly code = LEARNING_EVENT_UNSUPPORTED_VERSION_CODE;
  constructor(readonly version: unknown) {
    super('Unsupported learning event schema version');
    this.name = 'LearningEventVersionError';
  }
}

/**
 * Raised on a malformed/invalid event field. `field` names the offending field
 * (never the value); `reason` is a short, safe description.
 */
export class LearningEventValidationError extends Error {
  readonly code = LEARNING_EVENT_VALIDATION_CODE;
  constructor(
    readonly field: string,
    reason: string,
  ) {
    super(`Invalid learning event field "${field}": ${reason}`);
    this.name = 'LearningEventValidationError';
  }
}

/**
 * Raised when the metadata object violates the CP-03 allow-list or a size
 * limit. `reason` is a short, safe description (it never echoes a rejected
 * value, which may be a secret).
 */
export class LearningEventMetadataError extends Error {
  readonly code = LEARNING_EVENT_METADATA_CODE;
  constructor(readonly reason: string) {
    super(`Invalid learning event metadata: ${reason}`);
    this.name = 'LearningEventMetadataError';
  }
}

/**
 * Raised when a caller-selected public id already identifies semantically
 * different evidence. The message is deliberately fixed: neither the stored
 * event nor the rejected payload is exposed.
 */
export class LearningEventConflictError extends Error {
  readonly code = LEARNING_EVENT_CONFLICT_CODE;
  constructor() {
    super('Learning event idempotency conflict');
    this.name = 'LearningEventConflictError';
  }
}
