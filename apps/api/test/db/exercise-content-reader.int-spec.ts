/**
 * Exercise content reader integration tests (CP-02).
 *
 * Run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test) only.
 * They prove the read-port invariant the CP-02 generator relies on: exercises
 * are seeded from APPROVED content only —
 *
 *   - a PUBLISHED lesson exposes its items in position order;
 *   - a DRAFT lesson is NOT readable (list returns null; items are not surfaced);
 *   - a single item is returned only when attached to a PUBLISHED lesson;
 *   - the reader surfaces only publicId + Chinese fields (no internal id).
 *
 * Given the DRAFT/PUBLISHED split, the reader is exercised through the real
 * Prisma-backed adapter. Guarding: if `TEST_DATABASE_URL` is missing or not the
 * exact local `clp_test`, the suite SKIPS. Rows are cleaned up in `afterAll`;
 * every value is synthetic.
 */
import { PrismaClient } from '@prisma/client';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';
import { PrismaService } from '../../src/modules/foundation/prisma.service';
import { PrismaExerciseContentReader } from '../../src/modules/exercise/infrastructure/prisma-exercise-content.reader';

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);

const describeDb = RUNNABLE ? describe : describe.skip;

describeDb('exercise content reader (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const reader = new PrismaExerciseContentReader(prisma as unknown as PrismaService);
  const createdUsers: string[] = [];
  const createdCourses: string[] = [];

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeAuthor(): Promise<string> {
    const t = tag();
    const user = await prisma.user.create({
      data: { login: `cp-02-${t}`, loginNormalized: `cp-02-${t}` },
    });
    createdUsers.push(user.id);
    return user.id;
  }

  async function makeLesson(
    authorId: string,
    visibility: 'DRAFT' | 'PUBLISHED',
  ): Promise<{ id: string; publicId: string }> {
    const t = tag();
    const course = await prisma.course.create({
      data: { slug: `c-${t}`, title: 'Course', authorId },
    });
    createdCourses.push(course.publicId);
    const unit = await prisma.unit.create({
      data: { courseId: course.id, slug: `u-${t}`, title: 'U', position: 0 },
    });
    const lesson = await prisma.lesson.create({
      data: { unitId: unit.id, slug: `l-${t}`, title: 'L', position: 0, visibility },
    });
    return { id: lesson.id, publicId: lesson.publicId };
  }

  afterAll(async () => {
    if (createdCourses.length) {
      await prisma.course.deleteMany({ where: { publicId: { in: createdCourses } } });
    }
    if (createdUsers.length) {
      await prisma.learningItem.deleteMany({ where: { authorId: { in: createdUsers } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    }
    await prisma.$disconnect();
  });

  it('lists a PUBLISHED lesson items in position order', async () => {
    const authorId = await makeAuthor();
    const lesson = await makeLesson(authorId, 'PUBLISHED');
    const i1 = await prisma.learningItem.create({
      data: {
        kind: 'VOCABULARY',
        simplified: '你好',
        pinyin: 'nǐ hǎo',
        meaning: 'hello',
        authorId,
      },
    });
    const i2 = await prisma.learningItem.create({
      data: {
        kind: 'VOCABULARY',
        simplified: '再见',
        pinyin: 'zài jiàn',
        meaning: 'bye',
        authorId,
      },
    });
    await prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: i1.id, position: 1 },
    });
    await prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: i2.id, position: 0 },
    });

    const ids = await reader.listApprovedItemIds(lesson.publicId);
    expect(ids).toEqual([i2.publicId, i1.publicId]);
  });

  it('treats a DRAFT lesson as unreadable (null) and does not surface its items', async () => {
    const authorId = await makeAuthor();
    const lesson = await makeLesson(authorId, 'DRAFT');
    const item = await prisma.learningItem.create({
      data: {
        kind: 'VOCABULARY',
        simplified: '谢谢',
        pinyin: 'xiè xie',
        meaning: 'thanks',
        authorId,
      },
    });
    await prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: item.id, position: 0 },
    });

    expect(await reader.listApprovedItemIds(lesson.publicId)).toBeNull();
    expect(await reader.getApprovedItem(item.publicId)).toBeNull();
  });

  it('returns an item only when attached to a PUBLISHED lesson', async () => {
    const authorId = await makeAuthor();
    const published = await makeLesson(authorId, 'PUBLISHED');
    const item = await prisma.learningItem.create({
      data: { kind: 'CHARACTER', simplified: '一', pinyin: 'yī', meaning: 'one', authorId },
    });
    // Not yet attached anywhere → not approved.
    expect(await reader.getApprovedItem(item.publicId)).toBeNull();

    await prisma.lessonLearningItem.create({
      data: { lessonId: published.id, learningItemId: item.id, position: 0 },
    });

    const surfaced = await reader.getApprovedItem(item.publicId);
    expect(surfaced).toEqual({
      learningItemPublicId: item.publicId,
      simplified: '一',
      pinyin: 'yī',
      meaning: 'one',
    });
    // No internal id leaks.
    expect((surfaced as unknown as Record<string, unknown>).id).toBeUndefined();
  });

  it('returns null for a missing lesson', async () => {
    expect(await reader.listApprovedItemIds('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
