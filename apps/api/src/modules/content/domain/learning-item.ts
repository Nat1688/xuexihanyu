/**
 * Learning-item domain model + Chinese-field contracts (CP-01).
 *
 * A reusable Chinese learning item carries Chinese-specific fields explicitly —
 * it is NEVER collapsed into a generic term/definition. The `kind` selects which
 * fields are REQUIRED vs optional, and the domain refuses an item that omits the
 * fields its kind makes meaningful.
 *
 * Required-field contract by kind:
 *
 *   | kind            | simplified | traditional | pinyin | meaning | reference |
 *   |-----------------|------------|-------------|--------|---------|-----------|
 *   | VOCABULARY      | required   | optional    | req.   | req.    | optional  |
 *   | CHARACTER       | required   | optional    | req.   | req.    | optional  |
 *   | GRAMMAR         | required   | optional    | opt.   | req.    | optional  |
 *   | EXAMPLE         | required   | optional    | opt.   | req.    | optional  |
 *   | MEDIA_REFERENCE | optional   | optional    | opt.   | opt.    | REQUIRED  |
 *
 * `reference` is a free-form JSON payload (structured, kind-specific). Its SHAPE
 * is validated only to the extent that MEDIA_REFERENCE must provide it; the item
 * domain never stores media itself (no media storage in CP-01).
 *
 * `hskLevel`, when present, must be an integer in `1..9` (HSK 3.0 bands).
 */
import { ContentValidationError } from './content-errors';
import { type LearningItemKind, isLearningItemKind } from './learning-item-kind';

/** Maximum length for the single-line Chinese fields, aligned with the DB. */
export const ITEM_TEXT_MAX_LENGTH = 200;

/** HSK level band bounds (HSK 3.0: 1..9). */
export const HSK_MIN_LEVEL = 1;
export const HSK_MAX_LEVEL = 9;

/** The persistence-agnostic view of a reusable learning item. */
export interface LearningItem {
  readonly publicId: string;
  readonly kind: LearningItemKind;
  readonly simplified: string | null;
  readonly traditional: string | null;
  readonly pinyin: string | null;
  readonly meaning: string | null;
  readonly hskLevel: number | null;
  readonly reference: Record<string, unknown> | null;
  readonly authorId: string;
}

/** Normalized input for constructing/validating a learning item. */
export interface LearningItemInput {
  kind: unknown;
  simplified?: unknown;
  traditional?: unknown;
  pinyin?: unknown;
  meaning?: unknown;
  hskLevel?: unknown;
  reference?: unknown;
}

/** Optional/required policy per kind. */
const KIND_REQUIREMENTS: Record<
  LearningItemKind,
  { simplified: boolean; pinyin: boolean; meaning: boolean; reference: boolean }
> = {
  VOCABULARY: { simplified: true, pinyin: true, meaning: true, reference: false },
  CHARACTER: { simplified: true, pinyin: true, meaning: true, reference: false },
  GRAMMAR: { simplified: true, pinyin: false, meaning: true, reference: false },
  EXAMPLE: { simplified: true, pinyin: false, meaning: true, reference: false },
  MEDIA_REFERENCE: { simplified: false, pinyin: false, meaning: false, reference: true },
};

function optionalText(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ContentValidationError(field, 'must be a string when provided');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > ITEM_TEXT_MAX_LENGTH) {
    throw new ContentValidationError(field, `must be at most ${ITEM_TEXT_MAX_LENGTH} characters`);
  }
  return trimmed;
}

function requiredText(field: string, value: unknown): string {
  const text = optionalText(field, value);
  if (text === null) {
    throw new ContentValidationError(field, `is required for this kind`);
  }
  return text;
}

/** Validate an optional HSK level: absent, or an integer in 1..9. */
export function validateHskLevel(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ContentValidationError('hskLevel', 'must be an integer when provided');
  }
  if (value < HSK_MIN_LEVEL || value > HSK_MAX_LEVEL) {
    throw new ContentValidationError(
      'hskLevel',
      `must be between ${HSK_MIN_LEVEL} and ${HSK_MAX_LEVEL}`,
    );
  }
  return value;
}

/** Validate the optional structured reference payload (a JSON object). */
function optionalReference(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentValidationError('reference', 'must be a JSON object when provided');
  }
  return { ...(value as Record<string, unknown>) };
}

/**
 * Build a validated {@link LearningItem}. Throws {@link ContentValidationError}
 * when the kind is unknown or the kind-specific required Chinese fields are
 * missing/invalid. Never stores media itself — a media item only carries a
 * structured `reference`.
 */
export function makeLearningItem(
  input: LearningItemInput & { publicId: string; authorId: string },
): LearningItem {
  if (!isLearningItemKind(input.kind)) {
    throw new ContentValidationError('kind', 'must be an approved learning-item kind');
  }
  const kind = input.kind;
  const req = KIND_REQUIREMENTS[kind];

  const simplified = req.simplified
    ? requiredText('simplified', input.simplified)
    : optionalText('simplified', input.simplified);
  const traditional = optionalText('traditional', input.traditional);
  const pinyin = req.pinyin
    ? requiredText('pinyin', input.pinyin)
    : optionalText('pinyin', input.pinyin);
  const meaning = req.meaning
    ? requiredText('meaning', input.meaning)
    : optionalText('meaning', input.meaning);
  const reference = optionalReference(input.reference);
  if (req.reference && reference === null) {
    throw new ContentValidationError('reference', 'is required for this kind');
  }

  return Object.freeze({
    publicId: input.publicId,
    kind,
    simplified,
    traditional,
    pinyin,
    meaning,
    hskLevel: validateHskLevel(input.hskLevel),
    reference,
    authorId: input.authorId,
  });
}
