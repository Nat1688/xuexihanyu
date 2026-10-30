import { createHash } from 'node:crypto';
import type { StoredComposition } from './content-repository';
export function compositionRevision(value: StoredComposition): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: value.lesson.title,
        description: value.lesson.description,
        visibility: value.lesson.visibility,
        items: value.items.map((item) => item.publicId),
      }),
    )
    .digest('hex');
}
