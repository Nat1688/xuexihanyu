/**
 * CP-02 ExerciseService unit tests (no Nest, no DB).
 *
 * Exercises the application service over an in-memory content reader to prove:
 *   - generation draws ONLY from items attached to a readable lesson, in the
 *     lesson's position order, and references them by publicId (no field copies);
 *   - distractors are deterministic and drawn from approved items only;
 *   - the learner projection carries no answer key;
 *   - evaluation is a pure, deterministic pass-through;
 *   - a malformed request and an unreadable lesson are refused safely;
 *   - nothing is persisted (the port is read-only).
 */
import { ContentValidationError, type ExerciseInstance } from '../../src/modules/exercise/domain';
import { type GenerateRequest } from '../../src/modules/exercise/application/exercise-ports';
import {
  FakeExerciseContentReader,
  makeExerciseService,
} from '../support/fake-exercise-content-reader';

function seedReader(): FakeExerciseContentReader {
  const reader = new FakeExerciseContentReader();
  reader.addItem({
    learningItemPublicId: 'i1',
    simplified: '你好',
    pinyin: 'nǐ hǎo',
    meaning: 'hello',
  });
  reader.addItem({
    learningItemPublicId: 'i2',
    simplified: '再见',
    pinyin: 'zài jiàn',
    meaning: 'goodbye',
  });
  reader.addItem({
    learningItemPublicId: 'i3',
    simplified: '谢谢',
    pinyin: 'xiè xie',
    meaning: 'thanks',
  });
  reader.addLesson('l1', ['i1', 'i2', 'i3']);
  return reader;
}

describe('ExerciseService — generation', () => {
  it('generates one exercise per approved item, in lesson order', async () => {
    const { service } = makeExerciseService(seedReader());
    const batch = await service.generate({
      lessonPublicId: 'l1',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
      limit: 10,
    });
    expect(batch.instances.map((i) => i.learningItemPublicId)).toEqual(['i1', 'i2', 'i3']);
    expect(batch.instances.map((i) => i.prompt)).toEqual(['你好', '再见', '谢谢']);
  });

  it('references content by publicId only and never copies other fields', async () => {
    const { service } = makeExerciseService(seedReader());
    const batch = await service.generate({
      lessonPublicId: 'l1',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
      limit: 1,
    });
    const instance = batch.instances[0];
    expect(instance.definition).toEqual({
      learningItemPublicId: 'i1',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
    });
    expect(instance.answer).toBe('hello');
    expect(instance.options).toBeNull();
  });

  it('honours the limit', async () => {
    const { service } = makeExerciseService(seedReader());
    const batch = await service.generate({
      lessonPublicId: 'l1',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
      limit: 2,
    });
    expect(batch.instances).toHaveLength(2);
  });

  it('builds deterministic multiple-choice options that include the answer', async () => {
    const { service } = makeExerciseService(seedReader());
    const request: GenerateRequest = {
      lessonPublicId: 'l1',
      mode: 'ZH_TO_VI',
      format: 'MULTIPLE_CHOICE',
      limit: 1,
      distractors: 2,
      seed: 's',
    };
    const a = await service.generate(request);
    const b = await service.generate(request);
    const optsA = a.instances[0].options!;
    const optsB = b.instances[0].options!;
    expect(optsA).toEqual(optsB);
    expect(optsA).toContain('hello');
    expect(optsA.filter((o) => o !== 'hello')).toHaveLength(2);
    // distractors are real approved answers, never invented
    for (const option of optsA) expect(['hello', 'goodbye', 'thanks']).toContain(option);
  });

  it('skips items lacking the field the mode requires (usable subset)', async () => {
    const reader = new FakeExerciseContentReader();
    reader.addItem({ learningItemPublicId: 'i1', simplified: '一', pinyin: null, meaning: 'one' });
    reader.addItem({ learningItemPublicId: 'i2', simplified: '二', pinyin: 'èr', meaning: 'two' });
    reader.addLesson('l1', ['i1', 'i2']);
    const { service } = makeExerciseService(reader);

    const batch = await service.generate({
      lessonPublicId: 'l1',
      mode: 'ZH_TO_PINYIN', // requires pinyin; i1 lacks it
      format: 'TYPING',
      limit: 10,
    });
    expect(batch.instances.map((i) => i.learningItemPublicId)).toEqual(['i2']);
  });

  it('yields an empty batch for a lesson with no usable items', async () => {
    const reader = new FakeExerciseContentReader();
    reader.addLesson('empty', []);
    const { service } = makeExerciseService(reader);
    const batch = await service.generate({
      lessonPublicId: 'empty',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
      limit: 10,
    });
    expect(batch.instances).toEqual([]);
  });

  it('refuses an unreadable/missing lesson safely', async () => {
    const { service } = makeExerciseService(seedReader());
    await expect(
      service.generate({ lessonPublicId: 'nope', mode: 'ZH_TO_VI', format: 'TYPING', limit: 5 }),
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it('refuses a malformed request before touching content', async () => {
    const { service, content } = makeExerciseService(seedReader());
    let reads = 0;
    content.listApprovedItemIds = async () => {
      reads += 1;
      return null;
    };
    await expect(
      service.generate({ lessonPublicId: 'l1', mode: 'ZH_TO_VI', format: 'TYPING', limit: 0 }),
    ).rejects.toBeInstanceOf(ContentValidationError);
    await expect(
      service.generate({
        lessonPublicId: 'l1',
        mode: 'AUDIO_TO_ZH' as never,
        format: 'TYPING',
        limit: 1,
      }),
    ).rejects.toBeInstanceOf(ContentValidationError);
    await expect(
      service.generate({
        lessonPublicId: 'l1',
        mode: 'ZH_TO_VI',
        format: 'ESSAY' as never,
        limit: 1,
      }),
    ).rejects.toBeInstanceOf(ContentValidationError);
    expect(reads).toBe(0);
  });
});

describe('ExerciseService — evaluation + projection', () => {
  it('evaluates a generated instance deterministically', async () => {
    const { service } = makeExerciseService(seedReader());
    const batch = await service.generate({
      lessonPublicId: 'l1',
      mode: 'ZH_TO_VI',
      format: 'TYPING',
      limit: 1,
    });
    const instance: ExerciseInstance = batch.instances[0];
    expect(service.evaluate(instance, ' HELLO ').correct).toBe(true);
    expect(service.evaluate(instance, 'goodbye').correct).toBe(false);
  });

  it('projects a learner batch stripped of answer keys and question fields', async () => {
    const { service } = makeExerciseService(seedReader());
    const batch = await service.generate({
      lessonPublicId: 'l1',
      mode: 'ZH_TO_VI',
      format: 'MULTIPLE_CHOICE',
      limit: 3,
      distractors: 1,
      seed: 's',
    });
    const view = service.toLearnerBatch(batch);
    expect(view.lessonPublicId).toBe('l1');
    expect(view.exercises).toHaveLength(3);
    for (const exercise of view.exercises) {
      const raw = exercise as unknown as Record<string, unknown>;
      expect(raw.answer).toBeUndefined();
      expect(raw.questionField).toBeUndefined();
    }
  });
});
