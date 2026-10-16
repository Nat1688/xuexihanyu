/**
 * Mastery projection persistence integration tests (CP-04).
 *
 * Run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test) only.
 * They prove the persistence-level invariants CP-04 requires, driving the REAL
 * Prisma event reader + projection repository through the service:
 *
 *   - incremental derivation writes one row per (user, item) pair with a
 *     non-guessable derived state and a UTC due-at instant;
 *   - a recompute OVERWRITES the same row (UNIQUE pair) — never duplicates —
 *     and re-running with no new evidence is idempotent;
 *   - `rebuild` clears the derived store and re-derives from the SAME immutable
 *     events, producing ROWS EQUAL to the incremental result (rebuild ==
 *     incremental) — the replaceable-projection invariant;
 *   - the mastery boundary NEVER mutates `learning_events`: the evidence rows
 *     are byte-for-byte unchanged after derive/replay/rebuild.
 *
 * Guarding: if `TEST_DATABASE_URL` is missing or not the exact local `clp_test`,
 * the suite SKIPS. Rows are cleaned up in `afterAll`; every value is synthetic.
 */
import { PrismaClient } from '@prisma/client';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';
import { PrismaService } from '../../src/modules/foundation/prisma.service';
import { PrismaMasteryEventReader } from '../../src/modules/mastery/infrastructure/prisma-mastery-event.reader';
import { PrismaMasteryProjectionRepository } from '../../src/modules/mastery/infrastructure/prisma-mastery-projection.repository';
import { MasteryService } from '../../src/modules/mastery/application/mastery-service';

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);

const describeDb = RUNNABLE ? describe : describe.skip;

describeDb('mastery projection persistence (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const createdUsers: string[] = [];
  const createdItems: string[] = [];

  const NOW = new Date('2026-10-16T12:00:00.000Z');

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeUser(): Promise<{ id: string; publicId: string }> {
    const t = tag();
    const user = await prisma.user.create({
      data: { login: `cp-04-${t}`, loginNormalized: `cp-04-${t}` },
    });
    createdUsers.push(user.id);
    return { id: user.id, publicId: user.publicId };
  }

  async function makeItem(authorId: string): Promise<{ id: string; publicId: string }> {
    const item = await prisma.learningItem.create({
      data: { kind: 'VOCABULARY', simplified: '你好', authorId },
    });
    createdItems.push(item.id);
    return { id: item.id, publicId: item.publicId };
  }

  async function addEvent(
    actorId: string,
    itemId: string,
    outcome: 'correct' | 'incorrect',
    msOffset: number,
  ): Promise<string> {
    const row = await prisma.learningEvent.create({
      data: {
        type: 'ANSWER_SUBMITTED',
        schemaVersion: 1,
        actorId,
        learningItemId: itemId,
        occurredAt: new Date(NOW.getTime() - 3600_000 + msOffset),
        metadata: { outcome } as never,
      },
    });
    return row.publicId;
  }

  function makeService(): MasteryService {
    const prismaService = prisma as unknown as PrismaService;
    const reader = new PrismaMasteryEventReader(prismaService);
    const store = new PrismaMasteryProjectionRepository(prismaService);
    return new MasteryService({ events: reader, projections: store });
  }

  afterAll(async () => {
    if (createdUsers.length) {
      await prisma.masteryProjection.deleteMany({ where: { actorId: { in: createdUsers } } });
      await prisma.learningEvent.deleteMany({ where: { actorId: { in: createdUsers } } });
    }
    if (createdItems.length) {
      await prisma.learningItem.deleteMany({ where: { id: { in: createdItems } } });
    }
    if (createdUsers.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    }
    await prisma.$disconnect();
  });

  it('derives one projection per (user,item) with a derived state and UTC due-at', async () => {
    const actor = await makeUser();
    const item = await makeItem(actor.id);
    await addEvent(actor.id, item.id, 'correct', 0);
    await addEvent(actor.id, item.id, 'correct', 1000);

    const service = makeService();
    const out = await service.deriveForActor(actor.publicId, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].learningItemPublicId).toBe(item.publicId);
    expect(out[0].state).toBe('FAMILIAR');
    expect(out[0].dueAt).toBeInstanceOf(Date);

    const row = await prisma.masteryProjection.findFirstOrThrow({
      where: { actorId: actor.id, learningItemId: item.id },
    });
    expect(row.state).toBe('FAMILIAR');
    expect(row.ruleVersion).toBe(1);
  });

  it('recompute OVERWRITES the same row (UNIQUE pair) — never duplicates', async () => {
    const actor = await makeUser();
    const item = await makeItem(actor.id);
    await addEvent(actor.id, item.id, 'correct', 0);

    const service = makeService();
    await service.deriveForActor(actor.publicId, NOW);
    await service.deriveForActor(actor.publicId, new Date(NOW.getTime() + 60_000));

    const count = await prisma.masteryProjection.count({
      where: { actorId: actor.id, learningItemId: item.id },
    });
    expect(count).toBe(1);
  });

  it('rebuild equals incremental AND never mutates evidence', async () => {
    const actor = await makeUser();
    const itemA = await makeItem(actor.id);
    const itemB = await makeItem(actor.id);
    const e1 = await addEvent(actor.id, itemA.id, 'correct', 0);
    await addEvent(actor.id, itemA.id, 'correct', 1000);
    await addEvent(actor.id, itemA.id, 'correct', 2000);
    await addEvent(actor.id, itemB.id, 'correct', 500);

    const service = makeService();
    const incremental = await service.deriveForActor(actor.publicId, NOW);

    // Snapshot the evidence BEFORE rebuild.
    const eventsBefore = await prisma.learningEvent.findMany({
      where: { actorId: actor.id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    await service.rebuild(NOW);
    const rebuilt = await service.listByActor(actor.publicId);

    const norm = (rows: typeof incremental) =>
      rows
        .map((p) => ({
          item: p.learningItemPublicId,
          state: p.state,
          dueAt: p.dueAt.toISOString(),
          consecutiveCorrect: p.consecutiveCorrect,
          latestOutcomeLapsed: p.latestOutcomeLapsed,
          lastEventPublicId: p.lastEventPublicId,
        }))
        .sort((a, b) => a.item.localeCompare(b.item));

    expect(norm(rebuilt)).toEqual(norm(incremental));

    // Evidence is byte-for-byte unchanged.
    const eventsAfter = await prisma.learningEvent.findMany({
      where: { actorId: actor.id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    expect(eventsAfter.map((r) => r.publicId)).toEqual(eventsBefore.map((r) => r.publicId));
    expect(eventsAfter.map((r) => r.type)).toEqual(eventsBefore.map((r) => r.type));
    expect(eventsAfter.map((r) => r.occurredAt.toISOString())).toEqual(
      eventsBefore.map((r) => r.occurredAt.toISOString()),
    );
    expect(eventsAfter.map((r) => r.metadata)).toEqual(eventsBefore.map((r) => r.metadata));
    // Sanity: the first event id still exists unchanged.
    const still = await prisma.learningEvent.findUnique({ where: { publicId: e1 } });
    expect(still).not.toBeNull();
  });

  it('deletes projections when a learning item is deleted (CASCADE), evidence survives', async () => {
    const actor = await makeUser();
    const item = await makeItem(actor.id);
    const eventPublicId = await addEvent(actor.id, item.id, 'correct', 0);

    const service = makeService();
    await service.deriveForActor(actor.publicId, NOW);
    expect(await prisma.masteryProjection.count({ where: { learningItemId: item.id } })).toBe(1);

    await prisma.learningItem.delete({ where: { id: item.id } });

    expect(await prisma.masteryProjection.count({ where: { learningItemId: item.id } })).toBe(0);
    // The event survives with a SET NULL item reference (evidence is not lost).
    const ev = await prisma.learningEvent.findUniqueOrThrow({ where: { publicId: eventPublicId } });
    expect(ev.learningItemId).toBeNull();
  });
});
