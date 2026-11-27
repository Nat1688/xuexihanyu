import { createHash } from 'node:crypto';
import { ContentValidationError } from '../../content/domain/content-errors';
import { type ExerciseMode } from './exercise-mode';
import { normalizeForField, type NormalizableField } from './normalization';

export interface OptionOrderContext {
  readonly answerField: NormalizableField;
  readonly answer: string;
  readonly lessonPublicId: string;
  readonly learningItemPublicId: string;
  readonly mode: ExerciseMode;
  readonly seed?: string;
}

/** mcq-order-v1: rank every option identically, never by correctness or input index.
 * The digest argument is a pure test seam for collision coverage, not request data.
 * Persist the returned order once; existing session snapshots must not be reordered.
 */
export function orderMcqOptions(
  options: readonly string[],
  context: OptionOrderContext,
  digest: (input: string) => string = (input) =>
    createHash('sha256').update(input, 'utf8').digest('hex'),
): string[] {
  const answerKey = normalizeForField(context.answerField, context.answer);
  const keys = new Set<string>();
  const ranked = options.map((value) => {
    const key = normalizeForField(context.answerField, value);
    if (!key || keys.has(key)) {
      throw new ContentValidationError('options', 'must contain distinct non-empty values');
    }
    keys.add(key);
    const rank = digest(
      JSON.stringify([
        'mcq-order-v1',
        context.seed ?? '',
        context.lessonPublicId,
        context.learningItemPublicId,
        context.mode,
        'MULTIPLE_CHOICE',
        key,
      ]),
    );
    return { value, key, rank };
  });
  if (!answerKey || !keys.has(answerKey)) {
    throw new ContentValidationError('options', 'must contain the expected value exactly once');
  }
  return ranked
    .sort((a, b) =>
      a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    )
    .map(({ value }) => value);
}
