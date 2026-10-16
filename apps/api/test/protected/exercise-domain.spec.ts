/**
 * CP-02 exercise domain unit tests (no Nest, no DB).
 *
 * Covers the pure, provider-neutral contracts the CP-02 acceptance criteria
 * require:
 *   - the content-derived mode/format vocabulary (audio is a placeholder only);
 *   - deterministic field normalization (Unicode/whitespace/case/diacritics);
 *   - deterministic distractor selection from approved candidates only;
 *   - the content-referenced definition/instance contract (no field copies, no
 *     answer key on the learner view);
 *   - pure, deterministic evaluation.
 */
import {
  AUDIO_EXERCISE_MODES,
  EXERCISE_FORMATS,
  EXERCISE_MODES,
  ContentValidationError,
  answersMatch,
  collapseWhitespace,
  evaluateAnswer,
  isAudioExerciseMode,
  isExerciseFormat,
  isExerciseMode,
  makeExerciseDefinition,
  modeFieldBinding,
  normalizeForField,
  normalizeUnicode,
  selectDistractors,
  toLearnerView,
  type ExerciseInstance,
} from '../../src/modules/exercise/domain';

describe('exercise mode/format vocabulary', () => {
  it('exposes exactly the four content-derived modes', () => {
    expect([...EXERCISE_MODES]).toEqual(['ZH_TO_VI', 'VI_TO_ZH', 'ZH_TO_PINYIN', 'PINYIN_TO_ZH']);
  });

  it('exposes exactly two answer formats', () => {
    expect([...EXERCISE_FORMATS]).toEqual(['MULTIPLE_CHOICE', 'TYPING']);
  });

  it('declares audio modes only as placeholders', () => {
    expect([...AUDIO_EXERCISE_MODES]).toEqual(['AUDIO_TO_ZH', 'AUDIO_TO_VI']);
    expect(isAudioExerciseMode('AUDIO_TO_ZH')).toBe(true);
    expect(isExerciseMode('AUDIO_TO_ZH')).toBe(false);
  });

  it('guards mode/format values', () => {
    expect(isExerciseMode('ZH_TO_VI')).toBe(true);
    expect(isExerciseMode('zh_to_vi')).toBe(false);
    expect(isExerciseMode(undefined)).toBe(false);
    expect(isExerciseFormat('TYPING')).toBe(true);
    expect(isExerciseFormat('ESSAY')).toBe(false);
  });

  it('binds each mode to its question/answer content field', () => {
    expect(modeFieldBinding('ZH_TO_VI')).toEqual({ question: 'simplified', answer: 'meaning' });
    expect(modeFieldBinding('VI_TO_ZH')).toEqual({ question: 'meaning', answer: 'simplified' });
    expect(modeFieldBinding('ZH_TO_PINYIN')).toEqual({ question: 'simplified', answer: 'pinyin' });
    expect(modeFieldBinding('PINYIN_TO_ZH')).toEqual({ question: 'pinyin', answer: 'simplified' });
  });

  it('refuses an unknown mode and an audio placeholder mode', () => {
    expect(() => modeFieldBinding('NOPE')).toThrow(ContentValidationError);
    expect(() => modeFieldBinding('AUDIO_TO_ZH')).toThrow(ContentValidationError);
  });
});

describe('deterministic normalization', () => {
  it('collapses whitespace runs and trims', () => {
    expect(collapseWhitespace('  a\t b\n c ')).toBe('a b c');
  });

  it('applies Unicode NFC', () => {
    // "e" + combining acute (NFD) normalizes to "é" (NFC).
    expect(normalizeUnicode('e\u0301')).toBe('é');
  });

  it('rejects non-string values', () => {
    expect(() => normalizeForField('simplified', 3)).toThrow(ContentValidationError);
    expect(() => normalizeForField('simplified', null)).toThrow(ContentValidationError);
  });

  it('NEVER case-normalizes Chinese (simplified) text', () => {
    expect(normalizeForField('simplified', '  Hello 你好 ')).toBe('Hello 你好');
    expect(normalizeForField('simplified', 'ABC')).toBe('ABC');
  });

  it('normalizes pinyin case and keeps tones by default (TONE_STRICT)', () => {
    expect(normalizeForField('pinyin', '  Nǐ  Hǎo ')).toBe('nǐ hǎo');
  });

  it('strips pinyin tone marks only when TONE_INSENSITIVE is requested', () => {
    expect(normalizeForField('pinyin', 'nǐ hǎo', { tonePolicy: 'TONE_INSENSITIVE' })).toBe(
      'ni hao',
    );
    // Base umlaut is preserved (ü is not a tone mark).
    expect(normalizeForField('pinyin', 'lǜ', { tonePolicy: 'TONE_INSENSITIVE' })).toBe('lü');
  });

  it('normalizes meaning case-insensitively but keeps Vietnamese diacritics', () => {
    expect(normalizeForField('meaning', '  Xin  Chào ')).toBe('xin chào');
    expect(normalizeForField('meaning', 'XIN CHÀO')).toBe('xin chào');
    // Diacritics remain significant: "chào" != "chao".
    expect(answersMatch('meaning', 'chào', 'chao')).toBe(false);
  });

  it('matches pinyin case-insensitively but tone-strictly by default', () => {
    expect(answersMatch('pinyin', 'Nǐ Hǎo', 'nǐ hǎo')).toBe(true);
    expect(answersMatch('pinyin', 'nǐ hǎo', 'ni hao')).toBe(false);
    expect(answersMatch('pinyin', 'nǐ hǎo', 'ni hao', { tonePolicy: 'TONE_INSENSITIVE' })).toBe(
      true,
    );
  });
});

describe('deterministic distractor selection', () => {
  const candidates = [
    { publicId: 'i1', value: 'one' },
    { publicId: 'i2', value: 'two' },
    { publicId: 'i3', value: 'three' },
    { publicId: 'i4', value: 'four' },
  ];

  it('never includes the correct answer as a distractor', () => {
    const picked = selectDistractors('meaning', 'one', candidates, { count: 3 });
    expect(picked).not.toContain('one');
  });

  it('is deterministic for the same seed and input', () => {
    const a = selectDistractors('meaning', 'one', candidates, { count: 3, seed: 's' });
    const b = selectDistractors('meaning', 'one', candidates, { count: 3, seed: 's' });
    expect(a).toEqual(b);
  });

  it('does not depend on the candidate input order', () => {
    const a = selectDistractors('meaning', 'one', candidates, { count: 3, seed: 's' });
    const shuffled = [candidates[2], candidates[0], candidates[3], candidates[1]];
    const b = selectDistractors('meaning', 'one', shuffled, { count: 3, seed: 's' });
    expect(a).toEqual(b);
  });

  it('de-duplicates candidates that normalize to the same value', () => {
    const dupes = [
      { publicId: 'i1', value: 'two' },
      { publicId: 'i2', value: '  TWO ' },
      { publicId: 'i3', value: 'three' },
    ];
    const picked = selectDistractors('meaning', 'one', dupes, { count: 5 });
    expect(picked.sort()).toEqual(['three', 'two']);
  });

  it('is best-effort: returns fewer than requested when the pool is small', () => {
    const picked = selectDistractors('meaning', 'one', [{ publicId: 'i2', value: 'two' }], {
      count: 3,
    });
    expect(picked).toEqual(['two']);
  });

  it('rejects an invalid count', () => {
    expect(() => selectDistractors('meaning', 'one', candidates, { count: -1 })).toThrow(
      ContentValidationError,
    );
    expect(() => selectDistractors('meaning', 'one', candidates, { count: 1.5 })).toThrow(
      ContentValidationError,
    );
  });
});

describe('exercise definition + learner view', () => {
  it('builds a content-referenced definition without field copies', () => {
    const def = makeExerciseDefinition({
      learningItemPublicId: 'item-1',
      mode: 'ZH_TO_VI',
      format: 'MULTIPLE_CHOICE',
    });
    expect(def).toEqual({
      learningItemPublicId: 'item-1',
      mode: 'ZH_TO_VI',
      format: 'MULTIPLE_CHOICE',
    });
    expect(Object.isFrozen(def)).toBe(true);
  });

  it('rejects an empty item reference, unknown mode or audio placeholder', () => {
    expect(() =>
      makeExerciseDefinition({ learningItemPublicId: '', mode: 'ZH_TO_VI', format: 'TYPING' }),
    ).toThrow(ContentValidationError);
    expect(() =>
      makeExerciseDefinition({ learningItemPublicId: 'i', mode: 'NOPE', format: 'TYPING' }),
    ).toThrow(ContentValidationError);
    expect(() =>
      makeExerciseDefinition({ learningItemPublicId: 'i', mode: 'AUDIO_TO_ZH', format: 'TYPING' }),
    ).toThrow(ContentValidationError);
  });

  it('rejects an unsupported format', () => {
    expect(() =>
      makeExerciseDefinition({ learningItemPublicId: 'i', mode: 'ZH_TO_VI', format: 'ESSAY' }),
    ).toThrow(ContentValidationError);
  });

  it('strips the answer key from the learner view', () => {
    const instance: ExerciseInstance = {
      definition: { learningItemPublicId: 'i1', mode: 'ZH_TO_VI', format: 'MULTIPLE_CHOICE' },
      learningItemPublicId: 'i1',
      mode: 'ZH_TO_VI',
      format: 'MULTIPLE_CHOICE',
      questionField: 'simplified',
      prompt: '你好',
      options: ['hello', 'goodbye', 'thanks'],
      answer: 'hello',
    };
    const view = toLearnerView(instance);
    expect(view).toEqual({
      learningItemPublicId: 'i1',
      mode: 'ZH_TO_VI',
      format: 'MULTIPLE_CHOICE',
      prompt: '你好',
      options: ['hello', 'goodbye', 'thanks'],
    });
    expect((view as unknown as Record<string, unknown>).answer).toBeUndefined();
    expect((view as unknown as Record<string, unknown>).questionField).toBeUndefined();
  });
});

describe('pure evaluation', () => {
  function instance(overrides: Partial<ExerciseInstance> = {}): ExerciseInstance {
    return {
      definition: { learningItemPublicId: 'i1', mode: 'ZH_TO_VI', format: 'TYPING' },
      learningItemPublicId: 'i1',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
      questionField: 'simplified',
      prompt: '你好',
      options: null,
      answer: 'hello',
      ...overrides,
    };
  }

  it('marks a case/space-insensitive typed answer correct', () => {
    const result = evaluateAnswer(instance(), '  HELLO ');
    expect(result.correct).toBe(true);
    expect(result.feedback).toBe('CORRECT');
    expect(result.expected).toBe('hello');
    expect(result.received).toBe('hello');
  });

  it('marks a wrong typed answer incorrect', () => {
    const result = evaluateAnswer(instance(), 'goodbye');
    expect(result.correct).toBe(false);
    expect(result.feedback).toBe('INCORRECT');
  });

  it('is tone-strict for pinyin by default', () => {
    const i = instance({ mode: 'ZH_TO_PINYIN', answer: 'nǐ hǎo' });
    expect(evaluateAnswer(i, 'nǐ hǎo').correct).toBe(true);
    expect(evaluateAnswer(i, 'ni hao').correct).toBe(false);
  });

  it('accepts only offered options for multiple choice', () => {
    const mc = instance({
      format: 'MULTIPLE_CHOICE',
      options: ['hello', 'goodbye', 'thanks'],
    });
    expect(evaluateAnswer(mc, 'hello').correct).toBe(true);
    expect(evaluateAnswer(mc, 'goodbye').correct).toBe(false);
    expect(() => evaluateAnswer(mc, 'not-an-option')).toThrow(ContentValidationError);
    expect(() => evaluateAnswer(mc, 42)).toThrow(ContentValidationError);
  });

  it('rejects a non-string typed answer', () => {
    expect(() => evaluateAnswer(instance(), 42)).toThrow(ContentValidationError);
  });

  it('is deterministic', () => {
    const a = evaluateAnswer(instance(), 'hello');
    const b = evaluateAnswer(instance(), 'hello');
    expect(a).toEqual(b);
  });
});
