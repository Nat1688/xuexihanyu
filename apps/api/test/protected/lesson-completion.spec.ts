import {
  readLessonCompletions,
  completionKey,
} from '../../src/modules/content/infrastructure/lesson-completion.reader';
import type { PrismaClient } from '@prisma/client';
describe('CORE-01 completion rule', () => {
  it('requires every current eligible item; keeps learners separate and ignores removed items/duplicate successes', async () => {
    const links = ['a', 'b'].map((publicId) => ({
      lesson: { publicId: 'lesson' },
      learningItem: { publicId, simplified: '你好', meaning: 'Xin chào' },
    }));
    links.push({
      lesson: { publicId: 'empty' },
      learningItem: { publicId: 'media', simplified: '', meaning: 'Âm thanh' },
    });
    const event = (studentId: string, itemId: string) => ({
      actor: { publicId: studentId },
      lesson: { publicId: 'lesson' },
      learningItem: { publicId: itemId },
    });
    const db = {
      lessonLearningItem: { findMany: jest.fn().mockResolvedValue(links) },
      learningEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            event('one', 'a'),
            event('one', 'a'),
            event('one', 'b'),
            event('two', 'a'),
            event('two', 'removed'),
          ]),
      },
    } as unknown as PrismaClient;
    const result = await readLessonCompletions(db, [
      { studentId: 'one', lessonId: 'lesson' },
      { studentId: 'two', lessonId: 'lesson' },
      { studentId: 'one', lessonId: 'empty' },
    ]);
    expect(result.get(completionKey('one', 'lesson'))).toEqual({
      total: 2,
      correct: 2,
      completed: true,
    });
    expect(result.get(completionKey('two', 'lesson'))).toEqual({
      total: 2,
      correct: 1,
      completed: false,
    });
    expect(result.get(completionKey('one', 'empty'))).toEqual({
      total: 0,
      correct: 0,
      completed: false,
    });
  });
});
