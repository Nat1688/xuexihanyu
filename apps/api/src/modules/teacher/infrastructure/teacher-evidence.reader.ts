/**
 * CP-06 evidence-backed progress reader.
 *
 * Reads (never writes):
 *   - CP-03 `learning_events` — the immutable evidence of record, filtered to
 *     ONE student AND the lessons assigned to them in the visible class, within
 *     a half-open `[from, to)` window.
 *   - CP-04 `mastery_projections` — the derived mastery state for exactly the
 *     in-scope items (also filtered by student).
 *
 * An empty lesson scope yields NO evidence: there is no code path where a
 * missing scope silently degrades into "all of the student's activity".
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type EvidenceEvent,
  type EvidenceQuery,
  type EvidenceRepository,
  type ItemEvidenceCount,
  type ItemMasteryRow,
} from '../application/teacher-ports';

/** Upper bound on rows scanned for per-item counting in one request. */
const MAX_EVIDENCE_SCAN = 20000;

@Injectable()
export class PrismaTeacherEvidenceReader implements EvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: EvidenceQuery) {
    return {
      actor: { publicId: query.studentPublicId },
      lesson: { publicId: { in: [...query.lessonPublicIds] } },
      occurredAt: { gte: query.from, lt: query.to },
    };
  }

  async countByItem(query: EvidenceQuery): Promise<ItemEvidenceCount[]> {
    if (query.lessonPublicIds.length === 0) return [];

    const rows = await this.prisma.learningEvent.findMany({
      where: {
        ...this.where(query),
        type: 'ANSWER_SUBMITTED',
        learningItemId: { not: null },
      },
      select: { learningItemId: true, metadata: true },
      take: MAX_EVIDENCE_SCAN,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });

    const byItem = new Map<string, { correct: number; incorrect: number }>();
    for (const row of rows) {
      if (!row.learningItemId) continue;
      const outcome = (row.metadata as { outcome?: unknown } | null)?.outcome;
      if (outcome !== 'correct' && outcome !== 'incorrect') continue;
      const bucket = byItem.get(row.learningItemId) ?? { correct: 0, incorrect: 0 };
      if (outcome === 'correct') bucket.correct += 1;
      else bucket.incorrect += 1;
      byItem.set(row.learningItemId, bucket);
    }
    if (byItem.size === 0) return [];

    const items = await this.prisma.learningItem.findMany({
      where: { id: { in: [...byItem.keys()] } },
      select: { id: true, publicId: true },
    });
    const publicOf = new Map(items.map((item) => [item.id, item.publicId]));

    return [...byItem.entries()]
      .map(([id, bucket]) => ({
        learningItemPublicId: publicOf.get(id) ?? id,
        correct: bucket.correct,
        incorrect: bucket.incorrect,
      }))
      .sort((a, b) => (a.learningItemPublicId < b.learningItemPublicId ? -1 : 1));
  }

  async countEvents(query: EvidenceQuery): Promise<number> {
    if (query.lessonPublicIds.length === 0) return 0;
    return this.prisma.learningEvent.count({ where: this.where(query) });
  }

  async listRecent(query: EvidenceQuery, limit: number): Promise<EvidenceEvent[]> {
    if (query.lessonPublicIds.length === 0) return [];
    const rows = await this.prisma.learningEvent.findMany({
      where: this.where(query),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        publicId: true,
        type: true,
        occurredAt: true,
        metadata: true,
        lesson: { select: { publicId: true } },
        learningItem: { select: { publicId: true } },
      },
    });
    return rows.map((row) => {
      const outcome = (row.metadata as { outcome?: unknown } | null)?.outcome;
      return {
        publicId: row.publicId,
        type: row.type,
        occurredAt: row.occurredAt,
        accepted: outcome === 'correct' ? true : outcome === 'incorrect' ? false : null,
        lessonPublicId: row.lesson?.publicId ?? null,
        learningItemPublicId: row.learningItem?.publicId ?? null,
      };
    });
  }

  async masteryForItems(
    studentPublicId: string,
    learningItemPublicIds: readonly string[],
  ): Promise<ItemMasteryRow[]> {
    if (learningItemPublicIds.length === 0) return [];
    const rows = await this.prisma.masteryProjection.findMany({
      where: {
        actor: { publicId: studentPublicId },
        learningItem: { publicId: { in: [...learningItemPublicIds] } },
      },
      select: {
        state: true,
        consecutiveCorrect: true,
        dueAt: true,
        learningItem: { select: { publicId: true } },
      },
    });
    return rows.map((row) => ({
      learningItemPublicId: row.learningItem.publicId,
      state: row.state,
      consecutiveCorrect: row.consecutiveCorrect,
      dueAt: row.dueAt,
    }));
  }
}
