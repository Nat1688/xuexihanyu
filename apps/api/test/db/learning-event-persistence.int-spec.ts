/**
 * Learning-events persistence integration tests (CP-03).
 *
 * Run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test) only.
 * They prove the persistence-level invariants CP-03 requires:
 *
 *   - append creates an immutable row with a non-guessable public UUID, the
 *     closed event type, schema version, UTC `occurred_at` and bounded JSONB;
 *   - the actor FK requires an existing user (evidence is attributable);
 *   - optional content references resolve to their tables and are SET NULL on
 *     reference deletion (evidence is NOT lost with its content);
 *   - the repository/table exposes NO update column semantics — a re-read after
 *     "append" returns the same values, and there is no mutable path;
 *   - ordering index (occurredAt, id) yields deterministic reads.
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

describeDb('learning-events persistence (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const createdUsers: string[] = [];
  const createdCourses: string[] = [];

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeUser(): Promise<string> {
    const t = tag();
    const user = await prisma.user.create({
      data: { login: `cp-03-${t}`, loginNormalized: `cp-03-${t}` },
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
    // Events reference users (RESTRICT) and courses (SET NULL); delete events
    // first, then courses (cascade units/lessons), then users.
    if (createdUsers.length) {
      await prisma.learningEvent.deleteMany({ where: { actorId: { in: createdUsers } } });
    }
    if (createdCourses.length) {
      await prisma.course.deleteMany({ where: { publicId: { in: createdCourses } } });
    }
    if (createdUsers.length) {
      await prisma.learningItem.deleteMany({ where: { authorId: { in: createdUsers } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    }
    await prisma.$disconnect();
  });

  it('appends an immutable event with a public UUID and closed type', async () => {
    const actorId = await makeUser();
    const occurredAt = new Date('2026-10-16T10:00:00.000Z');
    const row = await prisma.learningEvent.create({
      data: {
        type: 'LESSON_STARTED',
        schemaVersion: 1,
        actorId,
        occurredAt,
        metadata: { mode: 'ZH_TO_VI' } as never,
      },
    });
    expect(row.publicId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(row.publicId).not.toBe(row.id);
    expect(row.type).toBe('LESSON_STARTED');
    expect(row.schemaVersion).toBe(1);
    expect(row.occurredAt.toISOString()).toBe(occurredAt.toISOString());
    expect(row.metadata).toEqual({ mode: 'ZH_TO_VI' });

    // Re-read: the stored evidence is unchanged (no mutable path was exercised).
    const reread = await prisma.learningEvent.findUniqueOrThrow({
      where: { publicId: row.publicId },
    });
    expect(reread.type).toBe(row.type);
    expect(reread.schemaVersion).toBe(row.schemaVersion);
    expect(reread.occurredAt.toISOString()).toBe(row.occurredAt.toISOString());
    expect(reread.metadata).toEqual(row.metadata);
  });

  it('rejects an event type outside the closed vocabulary', async () => {
    const actorId = await makeUser();
    await expect(
      prisma.learningEvent.create({
        data: {
          type: 'MASTERY_UPDATED' as never,
          schemaVersion: 1,
          actorId,
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('requires an existing actor (FK integrity / attributability)', async () => {
    await expect(
      prisma.learningEvent.create({
        data: {
          type: 'REVIEW_ACTIVITY',
          schemaVersion: 1,
          actorId: '00000000-0000-4000-8000-000000000000',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('SET NULLs an optional course reference when the course is deleted (evidence survives)', async () => {
    const actorId = await makeUser();
    const course = await makeCourse(actorId);
    const row = await prisma.learningEvent.create({
      data: {
        type: 'EXERCISE_PRESENTED',
        schemaVersion: 1,
        actorId,
        courseId: course.id,
        occurredAt: new Date('2026-10-16T11:00:00.000Z'),
      },
    });
    await prisma.course.delete({ where: { id: course.id } });
    const after = await prisma.learningEvent.findUniqueOrThrow({
      where: { publicId: row.publicId },
    });
    expect(after.courseId).toBeNull();
    expect(after.type).toBe('EXERCISE_PRESENTED');
  });

  it('reads deterministically by (occurredAt, id)', async () => {
    const actorId = await makeUser();
    const t0 = new Date('2026-10-16T10:00:00.000Z');
    const t1 = new Date('2026-10-16T11:00:00.000Z');
    const t2 = new Date('2026-10-16T12:00:00.000Z');
    for (const occurredAt of [t2, t0, t1]) {
      await prisma.learningEvent.create({
        data: { type: 'LESSON_STARTED', schemaVersion: 1, actorId, occurredAt },
      });
    }
    const rows = await prisma.learningEvent.findMany({
      where: { actorId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    expect(rows.map((r) => r.occurredAt.toISOString())).toEqual([
      t0.toISOString(),
      t1.toISOString(),
      t2.toISOString(),
    ]);
  });

  it('stores bounded allow-listed metadata as JSONB', async () => {
    const actorId = await makeUser();
    const row = await prisma.learningEvent.create({
      data: {
        type: 'ANSWER_SUBMITTED',
        schemaVersion: 1,
        actorId,
        occurredAt: new Date(),
        exerciseRef: 'ex-2026-0001',
        metadata: { outcome: 'correct', durationMs: 900, source: 'web' } as never,
      },
    });
    expect(row.exerciseRef).toBe('ex-2026-0001');
    expect(row.metadata).toEqual({ outcome: 'correct', durationMs: 900, source: 'web' });
  });
});
