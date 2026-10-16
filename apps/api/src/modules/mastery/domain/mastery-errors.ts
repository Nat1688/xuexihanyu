/**
 * Mastery domain error vocabulary (CP-04).
 *
 * Every mastery/review contract failure is a typed error with a STABLE machine
 * code and a SAFE message (no SQL/ORM text, no internal identifier beyond what
 * the caller supplied, and never the offending raw value). CP-04 declares its
 * own codes so mastery failures are distinguishable from content/exercise/event
 * failures.
 */

/** Stable code for an unknown mastery state. */
export const MASTERY_UNKNOWN_STATE_CODE = 'MASTERY_UNKNOWN_STATE';

/** Stable code for an unsupported mastery rule version. */
export const MASTERY_UNSUPPORTED_RULE_VERSION_CODE = 'MASTERY_UNSUPPORTED_RULE_VERSION';

/** Stable code for a malformed/invalid mastery projection field. */
export const MASTERY_VALIDATION_CODE = 'MASTERY_VALIDATION';

/** Stable code for a projection keyed by a non-item event (no learning-item ref). */
export const MASTERY_UNKEYABLE_EVENT_CODE = 'MASTERY_UNKEYABLE_EVENT';

/**
 * Raised when a mastery state outside the closed vocabulary is supplied.
 * `value` is retained for server-side diagnostics but never interpolated into
 * the (safe) message.
 */
export class MasteryUnknownStateError extends Error {
  readonly code = MASTERY_UNKNOWN_STATE_CODE;
  constructor(readonly value: unknown) {
    super('Unsupported mastery state');
    this.name = 'MasteryUnknownStateError';
  }
}

/**
 * Raised when a requested rule version is not one this boundary can derive /
 * read. `version` is a number (safe to surface); the message stays fixed.
 */
export class MasteryRuleVersionError extends Error {
  readonly code = MASTERY_UNSUPPORTED_RULE_VERSION_CODE;
  constructor(readonly version: unknown) {
    super('Unsupported mastery rule version');
    this.name = 'MasteryRuleVersionError';
  }
}

/**
 * Raised on a malformed/invalid mastery field. `field` names the offending
 * field (never the value); `reason` is a short, safe description.
 */
export class MasteryValidationError extends Error {
  readonly code = MASTERY_VALIDATION_CODE;
  constructor(
    readonly field: string,
    reason: string,
  ) {
    super(`Invalid mastery field "${field}": ${reason}`);
    this.name = 'MasteryValidationError';
  }
}

/**
 * Raised when a projection is attempted for an event that carries no
 * learning-item reference (mastery is per user + learning item). `eventType` is
 * a safe token; the message never echoes event payloads.
 */
export class MasteryUnkeyableEventError extends Error {
  readonly code = MASTERY_UNKEYABLE_EVENT_CODE;
  constructor(readonly eventType: string) {
    super(`Event type "${eventType}" carries no learning-item reference`);
    this.name = 'MasteryUnkeyableEventError';
  }
}
