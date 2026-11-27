import type { LessonDocument } from '../curriculum/api';

export interface Flashcard {
  key: string;
  chinese: string;
  pinyin: string;
  meaning: string;
  example: string;
  lessons: string[];
}
export const MAX_DECK_CARDS = 2000;
export const MAX_COURSE_LESSONS = 50;
export class FlashcardSetupError extends Error {}
const text = (value: unknown) => (typeof value === 'string' ? value.normalize('NFC').trim() : '');

/** Only published learner-facing vocabulary/character text; no exercise answer keys. */
export function buildFlashcards(documents: LessonDocument[]): Flashcard[] {
  const cards: Flashcard[] = [];
  const seen = new Map<string, Flashcard>();
  for (const document of documents) {
    if (document.lesson.visibility !== 'PUBLISHED') continue;
    for (const [index, item] of document.items.entries()) {
      if (item.kind !== 'VOCABULARY' && item.kind !== 'CHARACTER') continue;
      const chinese = text(item.simplified),
        meaning = text(item.meaning);
      if (!chinese || !meaning) continue;
      const pinyin = text(item.pinyin),
        example = text(item.reference?.example);
      // Homographs with different meanings stay distinct; shared items repeat only once.
      const identity = JSON.stringify([
        item.publicId || `${document.lesson.publicId}:${index}`,
        chinese,
        pinyin,
        meaning,
        example,
      ]);
      const prior = seen.get(identity);
      if (prior) {
        if (!prior.lessons.includes(document.lesson.title))
          prior.lessons.push(document.lesson.title);
        continue;
      }
      const card = {
        key: `card-${cards.length}`,
        chinese,
        pinyin,
        meaning,
        example,
        lessons: [document.lesson.title],
      };
      cards.push(card);
      seen.set(identity, card);
      if (cards.length > MAX_DECK_CARDS)
        throw new FlashcardSetupError('Bộ thẻ có hơn 2.000 mục. Hãy chọn một bài học nhỏ hơn.');
    }
  }
  return cards;
}
