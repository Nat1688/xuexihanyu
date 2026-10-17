/**
 * Published-content reader for the student surface (CP-05).
 *
 * Reads ONLY PUBLISHED lessons and their items, and only the learner-facing
 * columns (title, external ids, Chinese/pinyin/meaning). Draft/archived/removed
 * lessons are invisible; author, audit and admin fields never leave this layer.
 *
 * Ordering is TOTAL and deterministic — course position, unit position, lesson
 * position, then public id — so TODAY is stable across calls for the same
 * corpus, independent of database plan or insertion order.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type StudentContentReader,
  type StudentLesson,
  type StudentLessonItem,
} from '../application/student-ports';

@Injectable()
export class PrismaStudentContentReader implements StudentContentReader {
  constructor(private readonly prisma: PrismaService) {}

  async listPublishedLessons(): Promise<StudentLesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { visibility: 'PUBLISHED' },
      select: {
        publicId: true,
        title: true,
        position: true,
        unit: {
          select: {
            publicId: true,
            position: true,
            course: { select: { publicId: true, position: true } },
          },
        },
      },
      orderBy: [
        { unit: { course: { position: 'asc' } } },
        { unit: { position: 'asc' } },
        { position: 'asc' },
        { publicId: 'asc' },
      ],
    });

    return rows.map((row) => ({
      lessonPublicId: row.publicId,
      title: row.title,
      unitPublicId: row.unit.publicId,
      coursePublicId: row.unit.course.publicId,
      position: row.position,
    }));
  }

  async listPublishedLessonItems(lessonPublicId: string): Promise<StudentLessonItem[] | null> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { publicId: lessonPublicId, visibility: 'PUBLISHED' },
      select: { id: true },
    });
    if (!lesson) return null;

    const rows = await this.prisma.lessonLearningItem.findMany({
      where: { lessonId: lesson.id },
      select: {
        position: true,
        learningItem: {
          select: {
            publicId: true,
            simplified: true,
            pinyin: true,
            meaning: true,
          },
        },
      },
      orderBy: [{ position: 'asc' }, { learningItem: { publicId: 'asc' } }],
    });

    return rows.map((row) => ({
      learningItemPublicId: row.learningItem.publicId,
      simplified: row.learningItem.simplified,
      pinyin: row.learningItem.pinyin,
      meaning: row.learningItem.meaning,
    }));
  }
}
