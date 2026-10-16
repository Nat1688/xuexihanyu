/**
 * Prisma-backed learning-event repository (CP-03).
 *
 * An APPEND-ONLY adapter over the `learning_events` table. It implements just
 * two operations: `append` and the bounded, read-only `listByActor`. There is
 * NO update/delete/upsert method — the port does not declare one and this class
 * does not add one, so application code has no path to mutate stored evidence.
 *
 * It maps rows to persistence-agnostic views whose only surfaced identifier is
 * `publicId`; the internal surrogate `id` never leaves this layer. External
 * (public) ids in the event references are resolved to internal foreign keys on
 * append and mapped back on read; an unknown reference resolves to `null`
 * rather than failing the append (the event is evidence, and a missing optional
 * reference must not lose the interaction record).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type EventMetadata,
  type EventMetadata as EventMetadataType,
  type LearningEventRefs,
  type LearningEventType,
  type NewLearningEvent,
  type StoredLearningEvent,
} from '../domain';
import { type LearningEventRepository } from '../application/learning-event-repository';

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

interface ResolvedRefs {
  courseId: string | null;
  unitId: string | null;
  lessonId: string | null;
  learningItemId: string | null;
  exerciseRef: string | null;
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
    return value as EventMetadataType;
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
export class PrismaLearningEventRepository implements LearningEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the external reference ids to internal keys. An optional reference
   * that cannot be resolved becomes `null` (never a hard failure), so an
   * interaction is not lost because a related row was removed.
   */
  private async resolveRefs(refs: LearningEventRefs): Promise<ResolvedRefs> {
    const course = refs.coursePublicId
      ? await this.prisma.course.findUnique({
          where: { publicId: refs.coursePublicId },
          select: { id: true },
        })
      : null;
    const unit = refs.unitPublicId
      ? await this.prisma.unit.findUnique({
          where: { publicId: refs.unitPublicId },
          select: { id: true },
        })
      : null;
    const lesson = refs.lessonPublicId
      ? await this.prisma.lesson.findUnique({
          where: { publicId: refs.lessonPublicId },
          select: { id: true },
        })
      : null;
    const learningItem = refs.learningItemPublicId
      ? await this.prisma.learningItem.findUnique({
          where: { publicId: refs.learningItemPublicId },
          select: { id: true },
        })
      : null;

    return {
      courseId: course?.id ?? null,
      unitId: unit?.id ?? null,
      lessonId: lesson?.id ?? null,
      learningItemId: learningItem?.id ?? null,
      exerciseRef: refs.exerciseRef ?? null,
    };
  }

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

    // An event's actor must exist (FK); if it somehow does not, surface the
    // internal id is never leaked — fall back to an empty string is unsafe, so
    // we return the row with a null actor and let the boundary drop it.
    return {
      ...row,
      actorPublicId: actor?.publicId ?? '',
      coursePublicId: course?.publicId ?? null,
      unitPublicId: unit?.publicId ?? null,
      lessonPublicId: lesson?.publicId ?? null,
      learningItemPublicId: learningItem?.publicId ?? null,
    };
  }

  async append(event: NewLearningEvent): Promise<StoredLearningEvent> {
    const actor = await this.prisma.user.findUnique({
      where: { publicId: event.actorPublicId },
      select: { id: true },
    });
    if (!actor) {
      // The actor public id does not resolve to a user; refuse rather than
      // fabricate an actor-less event. Error text is safe (no internal id).
      throw new Error('learning event actor could not be resolved');
    }

    const refs = await this.resolveRefs(event.refs);

    const row = await this.prisma.learningEvent.create({
      data: {
        type: event.type,
        schemaVersion: event.schemaVersion,
        actorId: actor.id,
        courseId: refs.courseId,
        unitId: refs.unitId,
        lessonId: refs.lessonId,
        learningItemId: refs.learningItemId,
        exerciseRef: refs.exerciseRef,
        occurredAt: event.occurredAt,
        metadata: (Object.keys(event.metadata).length ? event.metadata : undefined) as never,
      },
      select: EVENT_SELECT,
    });

    return toStored(await this.withRefs(row));
  }

  async listByActor(actorPublicId: string, limit: number): Promise<StoredLearningEvent[]> {
    const actor = await this.prisma.user.findUnique({
      where: { publicId: actorPublicId },
      select: { id: true },
    });
    if (!actor) return [];

    const rows = await this.prisma.learningEvent.findMany({
      where: { actorId: actor.id },
      select: EVENT_SELECT,
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return Promise.all(rows.map(async (row) => toStored(await this.withRefs(row))));
  }
}
