/**
 * Learning-item kind vocabulary (CP-01).
 *
 * A Chinese learning item is NEVER collapsed into a generic term/definition.
 * Every item declares an explicit `kind`, and the kind selects which
 * Chinese-specific fields are meaningful (enforced by `learning-item.ts`):
 *
 *   - `VOCABULARY`      — a word/phrase (simplified/traditional/pinyin/meaning).
 *   - `CHARACTER`       — one or more characters (same core fields).
 *   - `GRAMMAR`         — a grammar point (simplified/meaning; pinyin optional).
 *   - `EXAMPLE`         — an example sentence (Chinese text + meaning required).
 *   - `MEDIA_REFERENCE` — a structured REFERENCE to media (no media is stored;
 *                         only a `reference` payload points elsewhere).
 *
 * The values mirror the `LearningItemKind` Prisma enum 1:1.
 */
export const LEARNING_ITEM_KINDS = [
  'VOCABULARY',
  'CHARACTER',
  'GRAMMAR',
  'EXAMPLE',
  'MEDIA_REFERENCE',
] as const;

export type LearningItemKind = (typeof LEARNING_ITEM_KINDS)[number];

/** Type guard: is `value` an approved CP-01 learning-item kind? */
export function isLearningItemKind(value: unknown): value is LearningItemKind {
  return typeof value === 'string' && (LEARNING_ITEM_KINDS as readonly string[]).includes(value);
}
