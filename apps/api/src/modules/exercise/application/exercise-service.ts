/**
 * Exercise application service (CP-02).
 *
 * Orchestrates the two provider-neutral, deterministic use-cases:
 *
 *   1. GENERATE a batch of exercises for an approved lesson — resolving each
 *      source item's question field and (for multiple choice) building
 *      deterministic distractors drawn ONLY from other approved items.
 *   2. EVALUATE a submitted answer against a previously generated instance.
 *
 * The service owns NO HTTP, NO persistence and NO AI. It reads approved content
 * through the narrow {@link ExerciseContentReader} port, stores nothing, and
 * never calls a model. References to content are by external `publicId` only.
 *
 * Forbidden here (CP-02): attempt/event capture (CP-03), mastery/review
 * (CP-04), AI generation, media storage/delivery, exercise-session persistence.
 */
import {
  type ExerciseFormat,
  type ExerciseInstance,
  type ExerciseMode,
  type LearnerExerciseView,
  ContentValidationError,
  evaluateAnswer,
  modeFieldBinding,
  selectDistractors,
  toLearnerView,
  type EvaluationResult,
  type NormalizableField,
} from '../domain';
import {
  type ExerciseBatch,
  type ExerciseContentReader,
  type ExerciseSourceItem,
  type GenerateRequest,
} from './exercise-ports';

/** Dependencies for the exercise service. */
export interface ExerciseServiceDeps {
  readonly content: ExerciseContentReader;
}

/** The content field a mode draws its ANSWER from, mapped to a normalizable field. */
function answerFieldFor(mode: ExerciseMode): NormalizableField {
  return modeFieldBinding(mode).answer;
}

/** The content field a mode draws its QUESTION from, mapped to a normalizable field. */
function questionFieldFor(mode: ExerciseMode): NormalizableField {
  return modeFieldBinding(mode).question;
}

export class ExerciseService {
  constructor(private readonly deps: ExerciseServiceDeps) {}

  /**
   * Generate a deterministic batch of exercise instances for an approved
   * lesson. Throws {@link ContentValidationError} for a malformed request. Items
   * whose approved content lacks the fields the mode requires are SKIPPED (not
   * fatal), so a heterogeneous lesson still yields exercises from its usable
   * items; an entirely unusable lesson yields an empty batch.
   */
  async generate(request: GenerateRequest): Promise<ExerciseBatch> {
    const { mode, format } = request;
    if (!Number.isInteger(request.limit) || request.limit < 1) {
      throw new ContentValidationError('limit', 'must be a positive integer');
    }
    if (
      request.distractors !== undefined &&
      (!Number.isInteger(request.distractors) || request.distractors < 0)
    ) {
      throw new ContentValidationError('distractors', 'must be a non-negative integer');
    }
    // Validate mode (rejecting unknown/audio placeholders) and format BEFORE
    // any content read, so a bad request never touches the read port.
    modeFieldBinding(mode);
    if (format !== 'MULTIPLE_CHOICE' && format !== 'TYPING') {
      throw new ContentValidationError('format', 'must be MULTIPLE_CHOICE or TYPING');
    }

    const itemIds = await this.deps.content.listApprovedItemIds(request.lessonPublicId);
    if (itemIds === null) {
      throw new ContentValidationError(
        'lessonPublicId',
        'lesson is not readable or does not exist',
      );
    }

    const sourceItems: ExerciseSourceItem[] = [];
    for (const id of itemIds) {
      const item = await this.deps.content.getApprovedItem(id);
      if (item) sourceItems.push(item);
    }

    const questionField = questionFieldFor(mode);
    const answerField = answerFieldFor(mode);
    const distractorsPer = request.distractors ?? 3;

    // Candidate answers for distractors = every approved item's answer value.
    const distractorPool = sourceItems
      .map((item) => ({ publicId: item.learningItemPublicId, value: item[answerField] }))
      .filter((c): c is { publicId: string; value: string } => typeof c.value === 'string');

    const instances: ExerciseInstance[] = [];
    for (const item of sourceItems) {
      if (instances.length >= request.limit) break;
      const prompt = item[questionField];
      const answer = item[answerField];
      // Skip items lacking the fields this mode needs (usable subset only).
      if (typeof prompt !== 'string' || prompt.length === 0) continue;
      if (typeof answer !== 'string' || answer.length === 0) continue;

      let options: readonly string[] | null = null;
      if (format === 'MULTIPLE_CHOICE') {
        const distractors = selectDistractors(answerField, answer, distractorPool, {
          count: distractorsPer,
          seed: request.seed,
        });
        options = [answer, ...distractors];
      }

      instances.push(
        Object.freeze({
          definition: Object.freeze({
            learningItemPublicId: item.learningItemPublicId,
            mode,
            format,
          }),
          learningItemPublicId: item.learningItemPublicId,
          mode,
          format,
          questionField,
          prompt,
          options,
          answer,
        }),
      );
    }

    return {
      lessonPublicId: request.lessonPublicId,
      mode,
      format,
      instances,
    };
  }

  /**
   * Evaluate a submitted answer for an instance. Pure pass-through to the domain
   * evaluator (kept on the service so HTTP can depend on one entry point).
   */
  evaluate(instance: ExerciseInstance, submitted: unknown): EvaluationResult {
    return evaluateAnswer(instance, submitted);
  }

  /** Project an instance for delivery to a learner (strips the answer key). */
  toLearnerView(instance: ExerciseInstance): LearnerExerciseView {
    return toLearnerView(instance);
  }

  /** Project a whole batch for delivery to a learner. */
  toLearnerBatch(batch: ExerciseBatch): {
    lessonPublicId: string;
    mode: ExerciseMode;
    format: ExerciseFormat;
    exercises: LearnerExerciseView[];
  } {
    return {
      lessonPublicId: batch.lessonPublicId,
      mode: batch.mode,
      format: batch.format,
      exercises: batch.instances.map(toLearnerView),
    };
  }
}
