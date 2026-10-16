/**
 * Deterministic exercise evaluation (CP-02).
 *
 * Evaluation is a PURE function of (instance, submitted answer): it normalizes
 * both sides per the answer field's policy and returns a structured result.
 * There is NO AI, NO model, NO randomness — the same inputs always yield the
 * same verdict. The result NEVER exposes internal identifiers and never echoes
 * raw ORM/stack text.
 *
 * For MULTIPLE_CHOICE a submission must be one of the instance's options; an
 * option not present is rejected as a contract error rather than silently marked
 * wrong. For TYPING any string is accepted and compared after normalization.
 */
import { ContentValidationError } from '../../content/domain/content-errors';
import { type ExerciseInstance } from './exercise-definition';
import { answerFieldOf } from './exercise-mode';
import { normalizeForField } from './normalization';

/** The verdict of an evaluation. */
export interface EvaluationResult {
  readonly correct: boolean;
  /** Normalized expected answer (safe to surface). */
  readonly expected: string;
  /** Normalized received answer (safe to surface). */
  readonly received: string;
  /** Stable, safe feedback code. */
  readonly feedback: 'CORRECT' | 'INCORRECT';
}

/**
 * Evaluate a submitted answer against an instance. Throws a safe
 * {@link ContentValidationError} when the submission has the wrong shape for the
 * format (e.g. a non-string typing answer, or a multiple-choice answer not among
 * the offered options).
 */
export function evaluateAnswer(instance: ExerciseInstance, submitted: unknown): EvaluationResult {
  const field = answerFieldOf(instance.mode);

  if (instance.format === 'MULTIPLE_CHOICE') {
    if (typeof submitted !== 'string') {
      throw new ContentValidationError('answer', 'must be one of the offered options');
    }
    const options = instance.options ?? [];
    const offered = options.some(
      (option) => normalizeForField(field, option) === normalizeForField(field, submitted),
    );
    if (!offered) {
      throw new ContentValidationError('answer', 'must be one of the offered options');
    }
  } else if (typeof submitted !== 'string') {
    throw new ContentValidationError('answer', 'must be a string');
  }

  const expected = normalizeForField(field, instance.answer);
  const received = normalizeForField(field, submitted);
  const correct = expected.length > 0 && expected === received;
  return {
    correct,
    expected,
    received,
    feedback: correct ? 'CORRECT' : 'INCORRECT',
  };
}
