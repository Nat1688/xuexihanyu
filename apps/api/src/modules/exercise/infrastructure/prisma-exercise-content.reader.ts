/**
 * Prisma-backed exercise content reader (CP-02).
 *
 * Implements the {@link ExerciseContentReader} port over the CP-01 content
 * tables. It surfaces APPROVED content only: a lesson must be `PUBLISHED` for
 * its items to seed exercises, and a single item is returned only when it is
 * attached to at least one `PUBLISHED` lesson. It maps rows to the narrow,
 * read-only exercise view whose only external identifier is `publicId`; the
 * internal surrogate `id` never leaves this layer.
 *
 * It reads ONLY — CP-02 stores no exercise, attempt, event or mastery rows.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import { type ExerciseContentReader, type ExerciseSourceItem } from '../application/exercise-ports';

const ITEM_FIELD_SELECT = {
  publicId: true,
  simplified: true,
  pinyin: true,
  meaning: true,
} as const;

function toSourceItem(row: {
  publicId: string;
  simplified: string | null;
  pinyin: string | null;
  meaning: string | null;
}): ExerciseSourceItem {
  return {
    learningItemPublicId: row.publicId,
    simplified: row.simplified,
    pinyin: row.pinyin,
    meaning: row.meaning,
  };
}

@Injectable()
export class PrismaExerciseContentReader implements ExerciseContentReader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the item public ids attached to a lesson IN POSITION ORDER, or `null`
   * when the lesson is missing or not readable (not PUBLISHED).
   */
  async listApprovedItemIds(lessonPublicId: string): Promise<string[] | null> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { publicId: lessonPublicId },
      select: { id: true, visibility: true },
    });
    if (!lesson || lesson.visibility !== 'PUBLISHED') return null;
    const rows = await this.prisma.lessonLearningItem.findMany({
      where: { lessonId: lesson.id },
      select: { position: true, learningItem: { select: { publicId: true } } },
      orderBy: [{ position: 'asc' }],
    });
    return rows.map((r) => r.learningItem.publicId);
  }

  /**
   * Fetch a single approved source item, or `null` when it does not exist or is
   * not attached to any PUBLISHED lesson.
   */
  async getApprovedItem(learningItemPublicId: string): Promise<ExerciseSourceItem | null> {
    const row = await this.prisma.learningItem.findFirst({
      where: {
        publicId: learningItemPublicId,
        lessons: { some: { lesson: { visibility: 'PUBLISHED' } } },
      },
      select: ITEM_FIELD_SELECT,
    });
    return row ? toSourceItem(row) : null;
  }
}
