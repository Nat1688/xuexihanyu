/**
 * Content persistence integration tests (CP-01).
 *
 * Run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test) only.
 * They prove the persistence-level invariants CP-01 requires:
 *
 *   - hierarchy order uniqueness WITHIN a parent scope (course/unit/lesson
 *     position), while the same position is allowed across different parents;
 *   - slug uniqueness within a parent scope for units/lessons;
 *   - the reusable learning-item kind enum + Chinese fields round-trip, and
 *     `lesson_learning_items` orders items within a lesson;
 *   - author FK integrity (content requires an existing author).
 *
 * Guarding: if `TEST_DATABASE_URL` is missing or not the exact local `clp_test`,
 * the suite SKIPS. Rows are cleaned up in `afterAll`; every value is synthetic.
 */
import { PrismaClient } from '@prisma/client';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);

const describeDb = RUNNABLE ? describe : describe.skip;

describeDb('content persistence (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const createdUsers: string[] = [];
  const createdCourses: string[] = [];

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeAuthor(): Promise<string> {
    const t = tag();
    const user = await prisma.user.create({
      data: { login: `cp-01-${t}`, loginNormalized: `cp-01-${t}` },
    });
    createdUsers.push(user.id);
    return user.id;
  }

  async function makeCourse(authorId: string): Promise<{ id: string; publicId: string }> {
    const t = tag();
    const course = await prisma.course.create({
      data: { slug: `c-${t}`, title: 'Course', authorId },
    });
    createdCourses.push(course.publicId);
    return { id: course.id, publicId: course.publicId };
  }

  afterAll(async () => {
    // Courses cascade to units/lessons/lesson_learning_items; items are
    // separate. Delete in FK-safe order.
    if (createdCourses.length) {
      await prisma.course.deleteMany({ where: { publicId: { in: createdCourses } } });
    }
    if (createdUsers.length) {
      await prisma.learningItem.deleteMany({ where: { authorId: { in: createdUsers } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    }
    await prisma.$disconnect();
  });

  it('enforces a non-guessable UNIQUE public UUID for a course', async () => {
    const authorId = await makeAuthor();
    const course = await prisma.course.create({
      data: { slug: `c-${tag()}`, title: 'Course', authorId },
    });
    createdCourses.push(course.publicId);
    expect(course.publicId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(course.publicId).not.toBe(course.id);
    expect(course.visibility).toBe('DRAFT');
  });

  it('requires an existing author (FK integrity)', async () => {
    await expect(
      prisma.course.create({
        data: {
          slug: `c-${tag()}`,
          title: 'Orphan',
          authorId: '00000000-0000-4000-8000-000000000000',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces unit position UNIQUE per course, allows the same position across courses', async () => {
    const authorId = await makeAuthor();
    const a = await makeCourse(authorId);
    const b = await makeCourse(authorId);

    await prisma.unit.create({ data: { courseId: a.id, slug: 'u1', title: 'U1', position: 0 } });
    // Same (courseId, position) is refused.
    await expect(
      prisma.unit.create({ data: { courseId: a.id, slug: 'u2', title: 'U2', position: 0 } }),
    ).rejects.toThrow();
    // Different course, same position is allowed.
    await expect(
      prisma.unit.create({ data: { courseId: b.id, slug: 'u1', title: 'U1', position: 0 } }),
    ).resolves.toBeDefined();
  });

  it('enforces lesson slug + position uniqueness within a unit', async () => {
    const authorId = await makeAuthor();
    const course = await makeCourse(authorId);
    const unit = await prisma.unit.create({
      data: { courseId: course.id, slug: 'u1', title: 'U1', position: 0 },
    });
    await prisma.lesson.create({ data: { unitId: unit.id, slug: 'l1', title: 'L1', position: 0 } });
    await expect(
      prisma.lesson.create({ data: { unitId: unit.id, slug: 'l1', title: 'L1b', position: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.lesson.create({ data: { unitId: unit.id, slug: 'l2', title: 'L2', position: 0 } }),
    ).rejects.toThrow();
  });

  it('round-trips a Chinese learning item with kind-specific fields', async () => {
    const authorId = await makeAuthor();
    const item = await prisma.learningItem.create({
      data: {
        kind: 'VOCABULARY',
        simplified: '你好',
        traditional: '你好',
        pinyin: 'nǐ hǎo',
        meaning: 'hello',
        hskLevel: 1,
        authorId,
      },
    });
    expect(item.kind).toBe('VOCABULARY');
    expect(item.simplified).toBe('你好');
    expect(item.traditional).toBe('你好');
    expect(item.pinyin).toBe('nǐ hǎo');
    expect(item.meaning).toBe('hello');
    expect(item.hskLevel).toBe(1);
  });

  it('stores a MEDIA_REFERENCE item as a structured reference (no media table)', async () => {
    const authorId = await makeAuthor();
    const item = await prisma.learningItem.create({
      data: {
        kind: 'MEDIA_REFERENCE',
        reference: { provider: 'external', url: 'https://example.invalid/a.mp3' },
        authorId,
      },
    });
    expect(item.kind).toBe('MEDIA_REFERENCE');
    expect(item.simplified).toBeNull();
    expect((item.reference as Record<string, unknown>).provider).toBe('external');
  });

  it('orders items within a lesson via lesson_learning_items', async () => {
    const authorId = await makeAuthor();
    const course = await makeCourse(authorId);
    const unit = await prisma.unit.create({
      data: { courseId: course.id, slug: 'u1', title: 'U1', position: 0 },
    });
    const lesson = await prisma.lesson.create({
      data: { unitId: unit.id, slug: 'l1', title: 'L1', position: 0 },
    });
    const i1 = await prisma.learningItem.create({
      data: { kind: 'CHARACTER', simplified: '一', pinyin: 'yī', meaning: 'one', authorId },
    });
    const i2 = await prisma.learningItem.create({
      data: { kind: 'CHARACTER', simplified: '二', pinyin: 'èr', meaning: 'two', authorId },
    });
    await prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: i1.id, position: 1 },
    });
    await prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: i2.id, position: 0 },
    });
    const rows = await prisma.lessonLearningItem.findMany({
      where: { lessonId: lesson.id },
      orderBy: { position: 'asc' },
      include: { learningItem: { select: { simplified: true } } },
    });
    expect(rows.map((r) => r.learningItem.simplified)).toEqual(['二', '一']);
    // Duplicate position within a lesson is refused.
    await expect(
      prisma.lessonLearningItem.create({
        data: { lessonId: lesson.id, learningItemId: i1.id, position: 0 },
      }),
    ).rejects.toThrow();
  });
});
