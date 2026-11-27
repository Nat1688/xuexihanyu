import {
  orderMcqOptions,
  type OptionOrderContext,
} from '../../src/modules/exercise/domain/option-ordering';
import {
  ContentValidationError,
  EXERCISE_MODES,
  modeFieldBinding,
  normalizeForField,
} from '../../src/modules/exercise/domain';
import {
  FakeExerciseContentReader,
  makeExerciseService,
} from '../support/fake-exercise-content-reader';

const options = Object.freeze(['你好', '再见', '学生', '老师']);
const context: OptionOrderContext = Object.freeze({
  answerField: 'simplified',
  answer: '你好',
  lessonPublicId: 'lesson-fixture',
  learningItemPublicId: 'item-fixture',
  mode: 'VI_TO_ZH',
});

describe('MCQ-ORDER M01–M11', () => {
  it.each([
    ['', ['你好', '学生', '再见', '老师']],
    ['s1', ['你好', '学生', '老师', '再见']],
    ['s2', ['老师', '学生', '你好', '再见']],
  ])('M01 golden vector %s', (seed, expected) => {
    expect(orderMcqOptions(options, { ...context, seed: seed as string })).toEqual(expected);
  });
  it('M01 undefined seed equals empty', () => {
    expect(orderMcqOptions(options, context)).toEqual(
      orderMcqOptions(options, { ...context, seed: '' }),
    );
  });
  it('M02/M04 is input-order independent, exact permutation and does not mutate', () => {
    const expected = orderMcqOptions(options, context);
    for (let i = 0; i < options.length; i++) {
      const rotated = Object.freeze([...options.slice(i), ...options.slice(0, i)].reverse());
      expect(orderMcqOptions(rotated, context)).toEqual(expected);
    }
    expect([...expected].sort()).toEqual([...options].sort());
    expect(options).toEqual(['你好', '再见', '学生', '老师']);
    expect(expected).not.toBe(options);
    expect(expected.filter((o) => o === context.answer)).toHaveLength(1);
  });
  it('M03 covers every correct position on a fixed corpus for all modes', () => {
    for (const mode of EXERCISE_MODES) {
      const positions = new Set<number>();
      for (let i = 0; i < 256; i++) {
        positions.add(
          orderMcqOptions(options, {
            ...context,
            mode,
            seed: `corpus-${i}`,
            learningItemPublicId: `item-${i % 7}`,
          }).indexOf(context.answer),
        );
      }
      expect([...positions].sort()).toEqual([0, 1, 2, 3]);
    }
  });
  it('M05 breaks injected digest collisions by key, not input order/correctness', () => {
    const digest = jest.fn(() => 'collision');
    const result = orderMcqOptions(options, context, digest);
    expect(result).toEqual([...options].sort());
    expect(orderMcqOptions([...options].reverse(), { ...context, answer: '老师' }, digest)).toEqual(
      result,
    );
    expect(digest.mock.calls).toHaveLength(8);
  });
  it.each([
    ['meaning', [' Chào ', 'chào']],
    ['pinyin', ['NǏ  HǍO', ' nǐ hǎo ']],
  ] as const)('M06 rejects normalized duplicates (%s)', (answerField, values) => {
    expect(() => orderMcqOptions(values, { ...context, answerField, answer: values[0] })).toThrow(
      ContentValidationError,
    );
  });
  it('M06 preserves raw text, Vietnamese accents and tone distinctions', () => {
    for (const [answerField, values] of [
      ['meaning', [' Chào ', 'chao', 'chaó']],
      ['pinyin', ['NǏ  HǍO', 'ní hǎo', 'ni hao']],
    ] as const) {
      const ordered = orderMcqOptions(values, { ...context, answerField, answer: values[0] });
      expect([...ordered].sort()).toEqual([...values].sort());
      expect(new Set(ordered.map((x) => normalizeForField(answerField, x))).size).toBe(3);
    }
  });
  it.each([[], ['你好', ''], ['你好', '你好'], ['老师']])(
    'M08 rejects malformed options safely %j',
    (...args) => {
      // Jest expands array table rows; normalize them back to an option list.
      const values = args as string[];
      expect(() => orderMcqOptions(values, context)).toThrow(ContentValidationError);
      try {
        orderMcqOptions(values, context);
      } catch (error) {
        expect((error as Error).message).not.toContain('你好');
      }
    },
  );
  it('M08 rejects an empty expected value', () => {
    expect(() => orderMcqOptions(options, { ...context, answer: ' ' })).toThrow(
      ContentValidationError,
    );
  });

  const reader = new FakeExerciseContentReader();
  const rows = [
    ['你好', 'nǐ hǎo', 'xin chào'],
    ['再见', 'zàijiàn', 'tạm biệt'],
    ['学生', 'xuésheng', 'học sinh'],
    ['老师', 'lǎoshī', 'giáo viên'],
  ];
  rows.forEach(([simplified, pinyin, meaning], i) =>
    reader.addItem({
      learningItemPublicId: `item-${i}`,
      simplified,
      pinyin,
      meaning,
    }),
  );
  reader.addLesson(
    'lesson',
    rows.map((_, i) => `item-${i}`),
  );
  const { service } = makeExerciseService(reader);

  it.each(EXERCISE_MODES)('M09–M11 generation/evaluation/typing/projection %s', async (mode) => {
    const request = { lessonPublicId: 'lesson', mode, limit: 4, seed: 'fixed' };
    const batch = await service.generate({ ...request, format: 'MULTIPLE_CHOICE' });
    const typing = await service.generate({ ...request, format: 'TYPING' });
    const binding = modeFieldBinding(mode);
    for (const [i, item] of batch.instances.entries()) {
      expect(item.options).toHaveLength(4);
      expect(item.options).toEqual(
        orderMcqOptions(item.options!, {
          ...context,
          answer: item.answer,
          answerField: binding.answer,
          lessonPublicId: 'lesson',
          learningItemPublicId: item.learningItemPublicId,
          mode,
          seed: 'fixed',
        }),
      );
      for (const value of item.options!) {
        expect(service.evaluate(item, value).correct).toBe(value === item.answer);
        expect(service.evaluate({ ...item, options: [...item.options!].reverse() }, value)).toEqual(
          service.evaluate(item, value),
        );
      }
      expect(() => service.evaluate(item, 'not-offered')).toThrow(ContentValidationError);
      expect(typing.instances[i]).toEqual({
        ...item,
        format: 'TYPING',
        options: null,
        definition: { ...item.definition, format: 'TYPING' },
      });
      const view = service.toLearnerView(item);
      expect(Object.keys(view).sort()).toEqual(
        ['format', 'learningItemPublicId', 'mode', 'options', 'prompt'].sort(),
      );
      expect(view.options).toEqual(item.options);
    }
  });
  it.each([0, 1, 9])('M07 preserves best effort distractor count %i', async (distractors) => {
    const batch = await service.generate({
      lessonPublicId: 'lesson',
      mode: 'VI_TO_ZH',
      format: 'MULTIPLE_CHOICE',
      limit: 4,
      distractors,
    });
    for (const item of batch.instances) {
      expect(item.options).toHaveLength(Math.min(distractors, 3) + 1);
      expect(item.options).toContain(item.answer);
    }
  });
});
