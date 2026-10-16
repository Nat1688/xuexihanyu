/**
 * Deterministic answer normalization (CP-02).
 *
 * Answer comparison must be exact yet fair: a learner's spacing/casing/Unicode
 * form should not cause a false negative, while Chinese characters must NEVER
 * be case-folded or otherwise mangled. This module is the single, pure
 * normalization policy and is fully test-covered.
 *
 * Policy (applied in this order):
 *
 *   1. Reject non-string input (a typed answer is text; a missing value is a
 *      contract error, not an empty string).
 *   2. Unicode NFC normalization (canonical composition) — so visually identical
 *      text compares equal regardless of the source's composition form.
 *   3. Trim leading/trailing whitespace, and COLLAPSE internal whitespace runs
 *      (spaces/tabs/newlines) to a single ASCII space.
 *   4. Case handling — declared PER FIELD/MODE, never globally:
 *        - Chinese fields (`simplified`) are NEVER case-normalized (Han
 *          characters have no case; the field may also carry Latin, which is
 *          left untouched for Chinese fields so identity is preserved).
 *        - Pinyin is case-insensitive for comparison (folded to lower-case);
 *          tone/diacritics are handled by the declared diacritic policy.
 *        - Meaning/translation (Vietnamese) is case-insensitive for comparison
 *          (folded to lower-case) and whitespace-collapsed.
 *   5. Diacritic/tone policy (per field):
 *        - `pinyin`: TONE-STRICT by default — tone marks are significant, so a
 *          correct versus wrong tone is distinguishable. A mode may opt into
 *          TONE-INSENSITIVE via {@link normalizeForField} options, in which case
 *          tone diacritics are stripped (base letters kept).
 *        - `meaning`: diacritics are significant (Vietnamese tones/letters),
 *          so they are preserved; only case/whitespace are normalized.
 *
 * This module imports NO content/exercise persistence and stores nothing.
 */
import { ContentValidationError } from '../../content/domain/content-errors';

/** Content fields this module can normalize. */
export type NormalizableField = 'simplified' | 'pinyin' | 'meaning';

/** Tone/diacritic handling for pinyin comparison. */
export type TonePolicy = 'TONE_STRICT' | 'TONE_INSENSITIVE';

/** Options controlling field-specific normalization. */
export interface NormalizeOptions {
  /**
   * Pinyin tone policy. Defaults to `TONE_STRICT` (tone marks are significant).
   * Ignored for non-pinyin fields.
   */
  readonly tonePolicy?: TonePolicy;
}

/**
 * Map of pinyin tone-marked vowels to their unmarked base letter. Used only
 * when the caller explicitly requests `TONE_INSENSITIVE`.
 */
const PINYIN_TONE_MARKS: Record<string, string> = {
  ā: 'a',
  á: 'a',
  ǎ: 'a',
  à: 'a',
  ē: 'e',
  é: 'e',
  ě: 'e',
  è: 'e',
  ī: 'i',
  í: 'i',
  ǐ: 'i',
  ì: 'i',
  ō: 'o',
  ó: 'o',
  ǒ: 'o',
  ò: 'o',
  ū: 'u',
  ú: 'u',
  ǔ: 'u',
  ù: 'u',
  ǖ: 'ü',
  ǘ: 'ü',
  ǚ: 'ü',
  ǜ: 'ü',
  ń: 'n',
  ň: 'n',
  ǹ: 'n',
  ḿ: 'm',
};

/**
 * Collapse a string's internal whitespace runs to single ASCII spaces and trim.
 * Unicode whitespace is matched via `\s` with the `u` flag.
 */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/**
 * Unicode NFC plus whitespace collapse. Applied to every field before any
 * field-specific case/diacritic handling.
 */
export function normalizeUnicode(value: string): string {
  return collapseWhitespace(value.normalize('NFC'));
}

/** Remove pinyin tone diacritics, keeping the base letters. */
function stripPinyinTones(value: string): string {
  let out = '';
  for (const ch of value) {
    out += PINYIN_TONE_MARKS[ch] ?? ch;
  }
  return out;
}

/**
 * Normalize a single value for the given content field. Throws a safe
 * {@link ContentValidationError} when `value` is not a string.
 */
export function normalizeForField(
  field: NormalizableField,
  value: unknown,
  options: NormalizeOptions = {},
): string {
  if (typeof value !== 'string') {
    throw new ContentValidationError(field, 'must be a string to normalize');
  }
  const base = normalizeUnicode(value);
  switch (field) {
    case 'simplified':
      // Chinese/Han text: NEVER case-normalized, diacritics preserved.
      return base;
    case 'pinyin': {
      const tonePolicy: TonePolicy = options.tonePolicy ?? 'TONE_STRICT';
      const toned = tonePolicy === 'TONE_INSENSITIVE' ? stripPinyinTones(base) : base;
      // Pinyin comparison is case-insensitive.
      return toned.toLowerCase();
    }
    case 'meaning':
      // Vietnamese meaning: case-insensitive comparison, diacritics significant.
      return base.toLowerCase();
  }
}

/**
 * Convenience: normalize a value for the answer field of a mode. `field` must
 * be a `NormalizableField`; callers resolve it from the mode binding first.
 */
export function normalizeAnswer(
  field: NormalizableField,
  value: unknown,
  options: NormalizeOptions = {},
): string {
  return normalizeForField(field, value, options);
}

/** True when two values are equal after field normalization. */
export function answersMatch(
  field: NormalizableField,
  expected: unknown,
  received: unknown,
  options: NormalizeOptions = {},
): boolean {
  return (
    normalizeForField(field, expected, options) === normalizeForField(field, received, options)
  );
}
