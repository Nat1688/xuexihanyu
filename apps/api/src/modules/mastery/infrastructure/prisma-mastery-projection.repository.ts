/**
 * Prisma-backed mastery projection repository (CP-04).
 *
 * A REPLACEABLE projection adapter over the `mastery_projections` table. Unlike
 * the append-only evidence tables, this store deliberately supports
 * replace/upsert/clear: a projection row is DERIVED and may be recomputed, and
 * the whole projection may be cleared and rebuilt. It NEVER reads or writes
 * `learning_events` — evidence is untouched.
 *
 * Write is an idempotent UPSERT keyed by the unique (actor_id, learning_item_id)
 * pair, so re-deriving the same projection leaves a single, equal row. External
 * (public) ids in a {@link MasteryProjection} are resolved to internal foreign
 * keys on write and mapped back on read; the internal surrogate `id` never
 * leaves this layer.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type MasteryProjection,
  type MasteryState,
  validateRuleVersion,
  validateMasteryState,
} from '../domain';
import {
  type MasteryProjectionRepository,
  type ProjectionKey,
} from '../application/mastery-projection-repository';

interface ProjectionRow {
  state: MasteryState;
  dueAt: Date;
  ruleVersion: number;
  consecutiveCorrect: number;
  latestOutcomeLapsed: boolean;
  sourceLastEventAt: Date | null;
  sourceLastEventId: string | null;
  recomputedAt: Date;
  actor: { publicId: string } | null;
  learningItem: { publicId: string } | null;
}

const PROJECTION_SELECT = {
  state: true,
  dueAt: true,
  ruleVersion: true,
  consecutiveCorrect: true,
  latestOutcomeLapsed: true,
  sourceLastEventAt: true,
  sourceLastEventId: true,
  recomputedAt: true,
  actor: { select: { publicId: true } },
  learningItem: { select: { publicId: true } },
} as const;

function toProjection(row: ProjectionRow): MasteryProjection {
  return Object.freeze({
    actorPublicId: row.actor?.publicId ?? '',
    learningItemPublicId: row.learningItem?.publicId ?? '',
    state: validateMasteryState(row.state),
    dueAt: row.dueAt,
    ruleVersion: validateRuleVersion(row.ruleVersion),
    consecutiveCorrect: row.consecutiveCorrect,
    latestOutcomeLapsed: row.latestOutcomeLapsed,
    lastEventAt: row.sourceLastEventAt,
    lastEventPublicId: row.sourceLastEventId,
    recomputedAt: row.recomputedAt,
  });
}

@Injectable()
export class PrismaMasteryProjectionRepository implements MasteryProjectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the (actor, item) public ids to internal keys; null when unknown. */
  private async resolveKeys(
    key: ProjectionKey,
  ): Promise<{ actorId: string; learningItemId: string } | null> {
    const [actor, item] = await Promise.all([
      this.prisma.user.findUnique({ where: { publicId: key.actorPublicId }, select: { id: true } }),
      this.prisma.learningItem.findUnique({
        where: { publicId: key.learningItemPublicId },
        select: { id: true },
      }),
    ]);
    if (!actor || !item) return null;
    return { actorId: actor.id, learningItemId: item.id };
  }

  async find(key: ProjectionKey): Promise<MasteryProjection | null> {
    const keys = await this.resolveKeys(key);
    if (!keys) return null;
    const row = await this.prisma.masteryProjection.findUnique({
      where: { actorId_learningItemId: keys },
      select: PROJECTION_SELECT,
    });
    return row ? toProjection(row) : null;
  }

  async listAll(): Promise<MasteryProjection[]> {
    const rows = await this.prisma.masteryProjection.findMany({
      select: PROJECTION_SELECT,
      orderBy: [{ actor: { publicId: 'asc' } }, { learningItem: { publicId: 'asc' } }],
    });
    return rows.map(toProjection);
  }

  async listByActor(actorPublicId: string): Promise<MasteryProjection[]> {
    const actor = await this.prisma.user.findUnique({
      where: { publicId: actorPublicId },
      select: { id: true },
    });
    if (!actor) return [];
    const rows = await this.prisma.masteryProjection.findMany({
      where: { actorId: actor.id },
      select: PROJECTION_SELECT,
      orderBy: [{ learningItem: { publicId: 'asc' } }],
    });
    return rows.map(toProjection);
  }

  async replace(projection: MasteryProjection): Promise<MasteryProjection> {
    const keys = await this.resolveKeys({
      actorPublicId: projection.actorPublicId,
      learningItemPublicId: projection.learningItemPublicId,
    });
    if (!keys) {
      // The pair does not resolve to real identity/content rows; refuse rather
      // than fabricate a row with dangling references. Message is safe.
      throw new Error('mastery projection references could not be resolved');
    }

    const data = {
      state: validateMasteryState(projection.state),
      dueAt: projection.dueAt,
      ruleVersion: validateRuleVersion(projection.ruleVersion),
      consecutiveCorrect: projection.consecutiveCorrect,
      latestOutcomeLapsed: projection.latestOutcomeLapsed,
      sourceLastEventAt: projection.lastEventAt,
      sourceLastEventId: projection.lastEventPublicId,
      recomputedAt: projection.recomputedAt,
    };

    const row = await this.prisma.masteryProjection.upsert({
      where: { actorId_learningItemId: keys },
      create: { ...keys, ...data },
      update: data,
      select: PROJECTION_SELECT,
    });
    return toProjection(row);
  }

  async replaceMany(projections: readonly MasteryProjection[]): Promise<number> {
    // Idempotent upsert per key. Writes are serialized (one transaction) to keep
    // a rebuild atomic and to avoid per-row round-trip storms.
    let written = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const projection of projections) {
        const keys = await this.resolveKeys({
          actorPublicId: projection.actorPublicId,
          learningItemPublicId: projection.learningItemPublicId,
        });
        if (!keys) continue;
        const data = {
          state: validateMasteryState(projection.state),
          dueAt: projection.dueAt,
          ruleVersion: validateRuleVersion(projection.ruleVersion),
          consecutiveCorrect: projection.consecutiveCorrect,
          latestOutcomeLapsed: projection.latestOutcomeLapsed,
          sourceLastEventAt: projection.lastEventAt,
          sourceLastEventId: projection.lastEventPublicId,
          recomputedAt: projection.recomputedAt,
        };
        await tx.masteryProjection.upsert({
          where: { actorId_learningItemId: keys },
          create: { ...keys, ...data },
          update: data,
        });
        written += 1;
      }
    });
    return written;
  }

  async clear(): Promise<number> {
    const result = await this.prisma.masteryProjection.deleteMany({});
    return result.count;
  }
}
