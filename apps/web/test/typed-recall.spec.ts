import { matchesSample, clozeExample } from '../src/flashcards/typed-recall';
import type { Flashcard } from '../src/flashcards/model';
const card = (patch: Partial<Flashcard> = {}): Flashcard => ({
  key: 'card',
  chinese: '你好',
  meaning: 'xin chào',
  pinyin: 'nǐ hǎo',
  example: '你好，小安！你好！',
  lessons: ['Bài học'],
  ...patch,
});

describe('local formative sample comparison', () => {
  it('normalizes NFC, outer whitespace and meaning capitalization only', () => {
    expect(matchesSample(' XIN  CHÀO ', 'xin chào', 'meaning')).toBe(true);
    expect(matchesSample(' 你好 ', '你好', 'chinese')).toBe(true);
  });
  it('does not guess synonyms or erase Vietnamese accents', () => {
    expect(matchesSample('chào bạn', 'xin chào', 'meaning')).toBe(false);
    expect(matchesSample('xin chao', 'xin chào', 'meaning')).toBe(false);
    expect(matchesSample('ma', 'má', 'meaning')).toBe(false);
  });
  it('does not convert Chinese writing or silently remove punctuation/interior spaces', () => {
    expect(matchesSample('學', '学', 'chinese')).toBe(false);
    expect(matchesSample('你 好', '你好', 'chinese')).toBe(false);
    expect(matchesSample('你好！', '你好', 'chinese')).toBe(false);
  });
  it('does not treat an empty answer as a match', () => {
    expect(matchesSample(' ', ' ', 'meaning')).toBe(false);
    expect(matchesSample('', '你好', 'chinese')).toBe(false);
  });
});
describe('cloze from real published examples', () => {
  it('masks every occurrence and preserves the rest of the sentence', () => {
    expect(clozeExample(card())).toBe('____，小安！____！');
  });
  it('treats target text literally rather than as a regular expression', () => {
    expect(clozeExample(card({ chinese: '[你好]', example: '[你好]和[你好]' }))).toBe('____和____');
  });
  it('never invents or guesses an example or equivalent target', () => {
    expect(clozeExample(card({ example: '' }))).toBeNull();
    expect(clozeExample(card({ example: '再见！' }))).toBeNull();
    expect(clozeExample(card({ chinese: '学', example: '學中文。' }))).toBeNull();
  });
  it('refuses HTML-like examples rather than presenting markup as a sentence', () => {
    expect(clozeExample(card({ example: '<strong>你好</strong>' }))).toBeNull();
  });
});
