/**
 * Exercise definition + instance contracts (CP-02).
 *
 * An exercise is PROVIDER-NEUTRAL and CONTENT-REFERENCED: a
 * {@link ExerciseDefinition} points at an approved learning item by its external
 * `publicId` and names the mode/format — it never copies the item's Chinese
 * fields (the item remains the single source of truth in the CP-01 content
 * domain). A {@link ExerciseInstance} is a materialized question: the resolved
 * prompt plus (for multiple choice) the deterministic options, still referencing
 * the source item by `publicId` and carrying NO answer key in the learner-facing
 * projection.
 *
 * Nothing here stores media or generates/fetches audio: exercise material is
 * text drawn from approved content. An answer key is kept ONLY on the
 * server-side instance used for evaluation and is never part of the
 * learner-facing projection.
 */
import { ContentValidationError } from '../../content/domain/content-errors';
import {
  type ExerciseFormat,
  type ExerciseMode,
  type QuestionField,
  isExerciseFormat,
  modeFieldBinding,
} from './exercise-mode';

/** A reference to a reusable learning item (external id only). */
export interface LearningItemRef {
  readonly learningItemPublicId: string;
}

/** A provider-neutral exercise definition (content-referenced, no field copies). */
export interface ExerciseDefinition {
  readonly learningItemPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
}

/** Authored input for a definition (validated here). */
export interface ExerciseDefinitionInput {
  learningItemPublicId: unknown;
  mode: unknown;
  format: unknown;
}

/** Validate and build an {@link ExerciseDefinition}. */
export function makeExerciseDefinition(input: ExerciseDefinitionInput): ExerciseDefinition {
  if (typeof input.learningItemPublicId !== 'string' || input.learningItemPublicId.length === 0) {
    throw new ContentValidationError('learningItemPublicId', 'must be a non-empty string');
  }
  // Resolves mode (rejecting unknown/audio) and pins the field binding.
  modeFieldBinding(input.mode);
  if (!isExerciseFormat(input.format)) {
    throw new ContentValidationError('format', 'must be MULTIPLE_CHOICE or TYPING');
  }
  return Object.freeze({
    learningItemPublicId: input.learningItemPublicId,
    mode: input.mode as ExerciseMode,
    format: input.format,
  });
}

/**
 * A materialized exercise instance (server-side). Carries the resolved prompt
 * and the answer key for evaluation. `options` is present ONLY for
 * MULTIPLE_CHOICE. The learner-facing projection ({@link toLearnerView}) strips
 * the answer key and the source-field name.
 */
export interface ExerciseInstance {
  readonly definition: ExerciseDefinition;
  readonly learningItemPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  /** Content field the question was drawn from (safe to surface). */
  readonly questionField: QuestionField;
  /** The prompt text shown to the learner (from approved content). */
  readonly prompt: string;
  /** Deterministic options (multiple choice only); includes the answer. */
  readonly options: readonly string[] | null;
  /** Server-only answer key (exact content value). NEVER sent to a learner. */
  readonly answer: string;
}

/** The learner-facing projection of an instance (no answer key, no field name). */
export interface LearnerExerciseView {
  readonly learningItemPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  readonly prompt: string;
  readonly options: readonly string[] | null;
}

/** Strip the answer key from an instance for delivery to a learner. */
export function toLearnerView(instance: ExerciseInstance): LearnerExerciseView {
  return Object.freeze({
    learningItemPublicId: instance.learningItemPublicId,
    mode: instance.mode,
    format: instance.format,
    prompt: instance.prompt,
    options: instance.options === null ? null : [...instance.options],
  });
}
