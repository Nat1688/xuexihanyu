import type { Flashcard } from './model';

export type PracticeMode = 'flip' | 'typing' | 'cloze';
export type AnswerKind = 'chinese' | 'meaning';

/** Local sample comparison only; never the server's evaluation/answer policy. */
export function matchesSample(answer: string, sample: string, kind: AnswerKind): boolean {
  const normalize = (value: string) => {
    const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
    return kind === 'meaning' ? text.toLocaleLowerCase('vi') : text;
  };
  return Boolean(answer.trim()) && normalize(answer) === normalize(sample);
}

/** Preserve published text, mask every target occurrence; never synthesize a sentence. */
export function clozeExample(card: Flashcard): string | null {
  const target = card.chinese.normalize('NFC').trim();
  const example = card.example.normalize('NFC');
  if (!target || !example.includes(target) || /[<>]/u.test(example)) return null;
  return example.split(target).join('____');
}
