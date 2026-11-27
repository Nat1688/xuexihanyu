import { createHash } from 'node:crypto';
import { z } from 'zod';
import { rawCatalog } from './catalog-data';

const text = z.string().min(1).max(3000);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const localized = z.object({ vi: text, en: text }).strict();
const schema = z
  .object({
    packageId: id,
    revision: id,
    status: z.literal('PREVIEW_ONLY'),
    specialistSignoff: z.literal(false),
    ownerPublication: z.literal(false),
    targetLanguage: z.literal('cmn'),
    script: z.literal('Hans'),
    concepts: z
      .array(z.object({ id, hanzi: text, pinyin: text, gloss: localized }).strict())
      .min(1)
      .max(30),
    dialogue: z
      .array(
        z
          .object({
            speaker: z.enum(['A', 'B']),
            hanzi: text,
            pinyin: text,
            translation: localized,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    variants: z
      .array(
        z
          .object({
            language: z.enum(['vi', 'en']),
            variantId: id,
            title: text,
            notice: text,
            objectives: z.array(text).min(1).max(6),
            blocks: z
              .array(
                z
                  .object({
                    id,
                    kind: z.enum(['explanation', 'pronunciationNote', 'activity']),
                    title: text,
                    text,
                  })
                  .strict(),
              )
              .min(1)
              .max(15),
          })
          .strict(),
      )
      .length(2),
    tasks: z
      .array(
        z
          .object({
            id,
            conceptId: id,
            field: z.enum(['simplified', 'pinyin']),
            format: z.enum(['CHOICE', 'TEXT']),
            options: z.array(text).min(2).max(5).nullable(),
            expected: z.string().min(1).max(200),
            prompt: localized,
            correct: localized,
            incorrect: localized,
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

export const CONTENT_MANIFEST = Object.freeze({
  revision: 'lc03b-preview-1',
  status: 'PREVIEW_ONLY',
  sha256: '0c1620265dd332df3fe6d9b16854bb4058b2d9ad452962e6943668c1496fc5fb',
  specialistSignoff: false,
  ownerPublication: false,
  source: 'LC-03A draft-1; condensed reader and P1/P3/P5; new derivative revision',
});
export type Catalog = z.infer<typeof schema>;

/** Build and startup validation: private product content, never a learner DTO. */
export function validateCatalog(input: unknown, digest: string): Catalog {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('Invalid preview catalog structure');
  const c = result.data;
  const distinct = (values: string[]) => new Set(values).size === values.length;
  if (
    !distinct(c.concepts.map((x) => x.id)) ||
    !distinct(c.variants.map((x) => x.language)) ||
    !distinct(c.variants.map((x) => x.variantId)) ||
    !distinct(c.tasks.map((x) => x.id)) ||
    c.variants.some((v) => !distinct(v.blocks.map((x) => x.id))) ||
    c.tasks.some(
      (t) =>
        !c.concepts.some((x) => x.id === t.conceptId) ||
        (t.format === 'CHOICE'
          ? !t.options || !distinct(t.options) || !t.options.includes(t.expected)
          : t.options !== null),
    )
  ) {
    throw new Error('Invalid preview catalog references');
  }
  if (createHash('sha256').update(JSON.stringify(input)).digest('hex') !== digest) {
    throw new Error('Preview catalog digest mismatch');
  }
  return c;
}

export function loadCatalog(): Catalog {
  return validateCatalog(rawCatalog, CONTENT_MANIFEST.sha256);
}
