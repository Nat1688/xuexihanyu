jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
jest.mock('../src/api/client', () => ({ request: jest.fn() }));
import { request } from '../src/api/client';
import { buildFlashcards, FlashcardSetupError } from '../src/flashcards/model';
import { publishedLessons, loadFlashcards } from '../src/flashcards/api';
import type { LessonDocument, LessonItem } from '../src/curriculum/api';
import type { ContentNode } from '../src/api/teacher';
const node = (publicId: string, visibility = 'PUBLISHED'): ContentNode => ({
  publicId,
  visibility,
  title: publicId,
  slug: publicId,
  description: null,
  position: 0,
});
const item = (patch: Partial<LessonItem> = {}): LessonItem => ({
  publicId: 'item',
  kind: 'VOCABULARY',
  simplified: '你好',
  pinyin: 'nǐ hǎo',
  meaning: 'xin chào',
  ...patch,
});
const doc = (id: string, items: LessonItem[], visibility = 'PUBLISHED'): LessonDocument => ({
  lesson: node(id, visibility),
  revision: 'synthetic-revision',
  items,
});
const mocked = jest.mocked(request);
beforeEach(() => mocked.mockReset());

describe('flashcard content snapshot', () => {
  it('normalizes Unicode without changing Mandarin content', () => {
    const cards = buildFlashcards([
      doc('lesson', [
        item({ simplified: '  你好 ', pinyin: 'nǐ hǎo'.normalize('NFD'), meaning: ' xin chào ' }),
      ]),
    ]);
    expect(cards[0]).toMatchObject({ chinese: '你好', pinyin: 'nǐ hǎo', meaning: 'xin chào' });
  });
  it('allows character cards without inventing missing Pinyin', () => {
    expect(
      buildFlashcards([doc('lesson', [item({ kind: 'CHARACTER', pinyin: null })])])[0].pinyin,
    ).toBe('');
  });
  it('excludes draft lessons, non-card kinds and unusable content', () => {
    expect(
      buildFlashcards([
        doc('draft', [item()], 'DRAFT'),
        doc('live', [
          item({ kind: 'GRAMMAR' }),
          item({ simplified: '' }),
          item({ meaning: ' ' }),
          item({ kind: 'MEDIA_REFERENCE' }),
        ]),
      ]),
    ).toEqual([]);
  });
  it('deduplicates a shared item while retaining lesson contexts and distinct meanings', () => {
    const cards = buildFlashcards([
      doc('one', [item()]),
      doc('two', [item(), item({ publicId: 'other', meaning: 'lời chào' })]),
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0].lessons).toEqual(['one', 'two']);
    expect(cards[1].meaning).toBe('lời chào');
  });
  it('copies only the text example and never answer-policy/reference metadata', () => {
    const card = buildFlashcards([
      doc('one', [
        item({
          reference: {
            example: '你好，小安！',
            answerKey: 'teacher-key',
            url: 'https://example.invalid/private',
          },
        }),
      ]),
    ])[0];
    expect(card.example).toBe('你好，小安！');
    expect(JSON.stringify(card)).not.toMatch(/teacher-key|private/);
    expect(
      buildFlashcards([doc('two', [item({ reference: { example: { unsafe: true } } })])])[0]
        .example,
    ).toBe('');
  });
  it('refuses an oversized deck rather than silently truncating it', () => {
    expect(() =>
      buildFlashcards([
        doc(
          'huge',
          Array.from({ length: 2001 }, (_, i) => item({ publicId: String(i) })),
        ),
      ]),
    ).toThrow(FlashcardSetupError);
  });
});
describe('existing authorized read contracts', () => {
  it('uses GET only and never traverses unpublished units or lessons', async () => {
    mocked
      .mockResolvedValueOnce([node('unit'), node('draft-unit', 'DRAFT')])
      .mockResolvedValueOnce([node('lesson'), node('draft-lesson', 'DRAFT')]);
    expect(await publishedLessons('course')).toEqual([node('lesson')]);
    expect(mocked.mock.calls).toEqual([
      ['GET', '/content/courses/course/units'],
      ['GET', '/content/units/unit/lessons'],
    ]);
  });
  it('loads published lesson text through existing GET without writing anything', async () => {
    mocked.mockResolvedValue(doc('lesson', [item()]));
    expect(await loadFlashcards([node('lesson')], () => true)).toHaveLength(1);
    expect(mocked.mock.calls).toEqual([['GET', '/content/lessons/lesson']]);
  });
  it('fails the entire deck on denied access rather than showing partial content', async () => {
    mocked.mockResolvedValueOnce(doc('one', [item()])).mockRejectedValueOnce(new Error('denied'));
    await expect(loadFlashcards([node('one'), node('two')], () => true)).rejects.toThrow('denied');
  });
  it('does not load more content after the learner leaves or switches course', async () => {
    let active = true;
    mocked.mockImplementationOnce(async () => {
      active = false;
      return doc('one', [item()]);
    });
    expect(await loadFlashcards([node('one'), node('two')], () => active)).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
  it('rejects unpublished or mismatched lesson documents', async () => {
    mocked.mockResolvedValueOnce(doc('lesson', [item()], 'DRAFT'));
    await expect(loadFlashcards([node('lesson')], () => true)).rejects.toThrow(FlashcardSetupError);
    mocked.mockResolvedValueOnce(doc('other', [item()]));
    await expect(loadFlashcards([node('lesson')], () => true)).rejects.toThrow(FlashcardSetupError);
  });
  it('bounds full-course reads without issuing requests for oversized selections', async () => {
    await expect(
      loadFlashcards(
        Array.from({ length: 51 }, (_, i) => node(String(i))),
        () => true,
      ),
    ).rejects.toThrow('50 bài');
    expect(mocked).not.toHaveBeenCalled();
  });
});
