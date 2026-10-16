/**
 * Learning-event record contract (CP-03).
 *
 * A {@link NewLearningEvent} is the VALIDATED, normalized form of an event
 * append request — everything the repository needs, with every field checked
 * and safe. Building one is pure: no I/O, no clock, no id generation (the
 * caller supplies the id and the receipt timestamp).
 *
 * A {@link StoredLearningEvent} is what the repository hands back: the same
 * evidence plus the server-assigned public id and receipt time.
 *
 * EVIDENCE, not progress: the record captures THAT an interaction happened and
 * its normalized outcome; it never stores a derived mastery/progress value and
 * never carries a raw answer, secret, cookie or session payload.
 */
import { type LearningEventType, validateEventType } from './learning-event-type';
import { validateSchemaVersion, CURRENT_SCHEMA_VERSION } from './schema-version';
import { type EventMetadata, validateEventMetadata } from './event-metadata';
import { validateOccurredAt } from './event-ordering';
import { LearningEventValidationError } from './learning-event-errors';

/**
 * Optional content/exercise references the event concerns. All are external
 * (public) ids supplied by the caller; the repository resolves them to internal
 * keys. `null`/absent means the reference does not apply to this event.
 */
export interface LearningEventRefs {
  readonly coursePublicId?: string | null;
  readonly unitPublicId?: string | null;
  readonly lessonPublicId?: string | null;
  readonly learningItemPublicId?: string | null;
  /** Opaque reference to a CP-02 exercise/instance (CP-02 owns no table). */
  readonly exerciseRef?: string | null;
}

/** A validated, normalized event ready to append. */
export interface NewLearningEvent {
  readonly type: LearningEventType;
  readonly schemaVersion: number;
  /** The acting user's public id (server-derived; never a client claim). */
  readonly actorPublicId: string;
  readonly refs: LearningEventRefs;
  readonly occurredAt: Date;
  readonly metadata: EventMetadata;
}

/** A persisted event as returned by the repository (evidence view). */
export interface StoredLearningEvent {
  readonly publicId: string;
  readonly type: LearningEventType;
  readonly schemaVersion: number;
  readonly actorPublicId: string;
  readonly refs: LearningEventRefs;
  readonly occurredAt: Date;
  readonly metadata: EventMetadata;
  readonly createdAt: Date;
}

/** Raw append request (untrusted; validated by {@link makeLearningEvent}). */
export interface AppendLearningEventInput {
  type: unknown;
  actorPublicId: unknown;
  occurredAt: unknown;
  schemaVersion?: unknown;
  metadata?: unknown;
  coursePublicId?: unknown;
  unitPublicId?: unknown;
  lessonPublicId?: unknown;
  learningItemPublicId?: unknown;
  exerciseRef?: unknown;
}

/** Maximum length of the opaque exercise reference (aligned with the column). */
export const EXERCISE_REF_MAX_LENGTH = 200;

function validateOptionalPublicId(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new LearningEventValidationError(field, 'must be a non-empty string when provided');
  }
  return value;
}

function validateExerciseRef(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new LearningEventValidationError(
      'exerciseRef',
      'must be a non-empty string when provided',
    );
  }
  if (value.length > EXERCISE_REF_MAX_LENGTH) {
    throw new LearningEventValidationError(
      'exerciseRef',
      `must be at most ${EXERCISE_REF_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/**
 * Validate and build a {@link NewLearningEvent} from an untrusted request.
 * Version defaults to {@link CURRENT_SCHEMA_VERSION} when omitted. Throws a
 * typed, safe error on any contract violation.
 */
export function makeLearningEvent(input: AppendLearningEventInput): NewLearningEvent {
  const type = validateEventType(input.type);

  const schemaVersion =
    input.schemaVersion === undefined
      ? CURRENT_SCHEMA_VERSION
      : validateSchemaVersion(input.schemaVersion);

  if (typeof input.actorPublicId !== 'string' || input.actorPublicId.length === 0) {
    throw new LearningEventValidationError('actorPublicId', 'must be a non-empty string');
  }

  const occurredAt = validateOccurredAt(input.occurredAt);
  const metadata = validateEventMetadata(input.metadata);

  const refs: LearningEventRefs = Object.freeze({
    coursePublicId: validateOptionalPublicId('coursePublicId', input.coursePublicId),
    unitPublicId: validateOptionalPublicId('unitPublicId', input.unitPublicId),
    lessonPublicId: validateOptionalPublicId('lessonPublicId', input.lessonPublicId),
    learningItemPublicId: validateOptionalPublicId(
      'learningItemPublicId',
      input.learningItemPublicId,
    ),
    exerciseRef: validateExerciseRef(input.exerciseRef),
  });

  return Object.freeze({
    type,
    schemaVersion,
    actorPublicId: input.actorPublicId,
    refs,
    occurredAt,
    metadata,
  });
}
