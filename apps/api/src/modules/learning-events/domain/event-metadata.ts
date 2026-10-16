/**
 * Learning-event metadata allow-list + size limits (CP-03).
 *
 * Event metadata is a BOUNDED, ALLOW-LISTED JSON object. It exists to carry
 * small, structured context about the interaction (e.g. which exercise mode was
 * presented), NEVER free-form learner input, answers, secrets or session
 * material.
 *
 * Two independent guards:
 *   1. KEY allow-list — only declared keys are accepted; any other key is a
 *      hard rejection (fail-closed), so an accidental `answer`/`token`/`cookie`
 *      field can never be persisted.
 *   2. STRUCTURE + SIZE — the value must be a flat object of primitive scalars
 *      (string|number|boolean), within per-key and total byte budgets. Nested
 *      objects/arrays are rejected (they are an unbounded smuggling channel).
 *
 * The allow-list is deliberately SMALL and evidence-shaped. Adding a key is a
 * contract change.
 */
import { LearningEventMetadataError } from './learning-event-errors';

/**
 * Approved metadata keys and the primitive type each accepts.
 *
 * `outcome` is the normalized evaluation outcome evidence (e.g. `correct` /
 * `incorrect`) — a short, closed token, NOT the raw submitted answer.
 */
export const METADATA_KEY_TYPES = {
  /** CP-02 exercise mode the event concerns (short token). */
  mode: 'string',
  /** CP-02 answer format (short token). */
  format: 'string',
  /** Normalized evaluation outcome evidence (short token). */
  outcome: 'string',
  /** Normalized response time in whole milliseconds (non-negative integer). */
  durationMs: 'number',
  /** Deterministic feedback code from CP-02 evaluation (short token). */
  feedbackCode: 'string',
  /** Bounded client interaction source token (short token). */
  source: 'string',
} as const;

export type MetadataKey = keyof typeof METADATA_KEY_TYPES;
export type MetadataValue = string | number | boolean;

/** The ordered set of approved keys (for diagnostics/tests). */
export const METADATA_ALLOWED_KEYS: readonly MetadataKey[] = Object.keys(
  METADATA_KEY_TYPES,
) as MetadataKey[];

/** Maximum serialized length of any single string value. */
export const METADATA_STRING_MAX_LENGTH = 120;

/** Maximum serialized byte budget for the whole metadata object. */
export const METADATA_MAX_BYTES = 1024;

/** Maximum number of approved keys permitted. */
export const METADATA_MAX_KEYS = METADATA_ALLOWED_KEYS.length;

/** A validated, frozen metadata object ready for persistence. */
export type EventMetadata = Readonly<Partial<Record<MetadataKey, MetadataValue>>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate and normalize an event metadata object against the CP-03 allow-list
 * and size limits. Returns a frozen object of approved scalars only.
 *
 * `undefined`/`null` yields an empty object (metadata is optional). Anything
 * that is not a plain object, carries an unknown key, carries a nested/array
 * value, or violates a size limit is rejected with a typed, safe error whose
 * message names the FIELD only — never the rejected value.
 */
export function validateEventMetadata(input: unknown): EventMetadata {
  if (input === undefined || input === null) return Object.freeze({});

  if (!isPlainObject(input)) {
    throw new LearningEventMetadataError('must be an object of approved scalar fields');
  }

  const keys = Object.keys(input);
  if (keys.length > METADATA_MAX_KEYS) {
    throw new LearningEventMetadataError(`at most ${METADATA_MAX_KEYS} fields are permitted`);
  }

  const out: Partial<Record<MetadataKey, MetadataValue>> = {};
  for (const key of keys) {
    if (!(key in METADATA_KEY_TYPES)) {
      // Fail-closed: an unknown key (e.g. a raw `answer`/`token`) is refused.
      throw new LearningEventMetadataError(`field "${key}" is not allowed`);
    }
    const expected = METADATA_KEY_TYPES[key as MetadataKey];
    const value = input[key];

    if (expected === 'string') {
      if (typeof value !== 'string') {
        throw new LearningEventMetadataError(`field "${key}" must be a string`);
      }
      if (value.length > METADATA_STRING_MAX_LENGTH) {
        throw new LearningEventMetadataError(
          `field "${key}" exceeds ${METADATA_STRING_MAX_LENGTH} characters`,
        );
      }
      out[key as MetadataKey] = value;
      continue;
    }

    // Number key (durationMs): a finite, non-negative number.
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new LearningEventMetadataError(`field "${key}" must be a non-negative number`);
    }
    if (key === 'durationMs' && !Number.isInteger(value)) {
      throw new LearningEventMetadataError(`field "${key}" must be a whole number`);
    }
    out[key as MetadataKey] = value;
  }

  const serialized = JSON.stringify(out);
  if (Buffer.byteLength(serialized, 'utf8') > METADATA_MAX_BYTES) {
    throw new LearningEventMetadataError(`metadata exceeds ${METADATA_MAX_BYTES} bytes`);
  }

  return Object.freeze(out);
}
