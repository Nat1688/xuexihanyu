/**
 * Content visibility vocabulary (CP-01).
 *
 * Every authored content node (course/unit/lesson) carries a visibility that
 * gates student reads server-side:
 *
 *   - `DRAFT`     — authorable but never surfaced to students.
 *   - `PUBLISHED` — readable by students.
 *
 * The values mirror the `ContentVisibility` Prisma enum 1:1 so persistence and
 * domain never drift. UI hiding is never authorization: the read policy is a
 * server-side predicate (see `content-read-policy.ts`).
 */
export const CONTENT_VISIBILITIES = ['DRAFT', 'PUBLISHED'] as const;

export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];

/** Type guard: is `value` an approved CP-01 visibility? */
export function isContentVisibility(value: unknown): value is ContentVisibility {
  return typeof value === 'string' && (CONTENT_VISIBILITIES as readonly string[]).includes(value);
}
