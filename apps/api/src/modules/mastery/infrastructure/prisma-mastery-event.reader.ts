/**
 * Prisma-backed mastery event reader (CP-04).
 *
 * A STRICTLY READ-ONLY adapter over the CP-03 `learning_events` table. It
 * exposes `listByActor` (bounded evidence read, deterministic order) and
 * `listAll` (full ordered read for a rebuild). There is NO append/update/delete
 * method — the mastery boundary cannot mutate evidence.
 *
 * It maps rows to persistence-agnostic {@link StoredLearningEvent} views whose
 * only surfaced identifier is `publicId`; the internal surrogate `id` never
 * leaves this layer. Reads are ordered `(occurredAt, id)` — the same total order
 * the CP-03 contract uses — so replay/rebuild is reproducible.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type EventMetadata,
  type LearningEventRefs,
  type LearningEventType,
  type StoredLearningEvent,
} from '../../learning-events/domain';
import { type MasteryEventReader } from '../application/mastery-event-reader';

interface EventRow {
  publicId: string;
  type: LearningEventType;
  schemaVersion: number;
  actorId: string;
  courseId: string | null;
  unitId: string | null;
  lessonId: string | null;
  learningItemId: string | null;
  exerciseRef: string | null;
  occurredAt: Date;
  metadata: unknown;
  createdAt: Date;
}

interface ResolvedRow extends EventRow {
  actorPublicId: string;
  coursePublicId: string | null;
  unitPublicId: string | null;
  lessonPublicId: string | null;
  learningItemPublicId: string | null;
}

const EVENT_SELECT = {
  publicId: true,
  type: true,
  schemaVersion: true,
  actorId: true,
  courseId: true,
  unitId: true,
  lessonId: true,
  learningItemId: true,
  exerciseRef: true,
  occurredAt: true,
  metadata: true,
  createdAt: true,
} as const;

function asMetadata(value: unknown): EventMetadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as EventMetadata;
  }
  return Object.freeze({});
}

function toStored(row: ResolvedRow): StoredLearningEvent {
  const refs: LearningEventRefs = Object.freeze({
    coursePublicId: row.coursePublicId,
    unitPublicId: row.unitPublicId,
    lessonPublicId: row.lessonPublicId,
    learningItemPublicId: row.learningItemPublicId,
    exerciseRef: row.exerciseRef,
  });
  return {
    publicId: row.publicId,
    type: row.type,
    schemaVersion: row.schemaVersion,
    actorPublicId: row.actorPublicId,
    refs,
    occurredAt: row.occurredAt,
    metadata: asMetadata(row.metadata),
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaMasteryEventReader implements MasteryEventReader {
  constructor(private readonly prisma: PrismaService) {}

  private async withRefs(row: EventRow): Promise<ResolvedRow> {
    const [actor, course, unit, lesson, learningItem] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: row.actorId }, select: { publicId: true } }),
      row.courseId
        ? this.prisma.course.findUnique({ where: { id: row.courseId }, select: { publicId: true } })
        : null,
      row.unitId
        ? this.prisma.unit.findUnique({ where: { id: row.unitId }, select: { publicId: true } })
        : null,
      row.lessonId
        ? this.prisma.lesson.findUnique({ where: { id: row.lessonId }, select: { publicId: true } })
        : null,
      row.learningItemId
        ? this.prisma.learningItem.findUnique({
            where: { id: row.learningItemId },
            select: { publicId: true },
          })
        : null,
    ]);

    return {
      ...row,
      actorPublicId: actor?.publicId ?? '',
      coursePublicId: course?.publicId ?? null,
      unitPublicId: unit?.publicId ?? null,
      lessonPublicId: lesson?.publicId ?? null,
      learningItemPublicId: learningItem?.publicId ?? null,
    };
  }

  async listByActor(actorPublicId: string): Promise<StoredLearningEvent[]> {
    const actor = await this.prisma.user.findUnique({
      where: { publicId: actorPublicId },
      select: { id: true },
    });
    if (!actor) return [];

    const rows = await this.prisma.learningEvent.findMany({
      where: { actorId: actor.id },
      select: EVENT_SELECT,
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    return Promise.all(rows.map(async (row) => toStored(await this.withRefs(row))));
  }

  async listAll(): Promise<StoredLearningEvent[]> {
    const rows = await this.prisma.learningEvent.findMany({
      select: EVENT_SELECT,
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    return Promise.all(rows.map(async (row) => toStored(await this.withRefs(row))));
  }
}
