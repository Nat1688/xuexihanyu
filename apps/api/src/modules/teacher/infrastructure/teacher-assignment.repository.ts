import {
  readLessonCompletions,
  completionKey,
} from '../../content/infrastructure/lesson-completion.reader';
/**
 * CP-06 assignment adapter (`lesson_assignments`).
 *
 * Assignments target one enrolled student in one class for one PUBLISHED
 * lesson; `(class_id, student_id, lesson_id)` is unique. Uniqueness races map
 * to `null` so the service answers a stable "already assigned" error.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import { isUniqueViolation } from './prisma-errors';
import {
  type AssignmentRecord,
  type AssignmentRepository,
  type AssignableLesson,
  type NewAssignment,
} from '../application/teacher-ports';

const ASSIGNMENT_SELECT = {
  publicId: true,
  dueAt: true,
  createdAt: true,
  class: { select: { publicId: true, owner: { select: { publicId: true } } } },
  student: { select: { publicId: true } },
  lesson: { select: { publicId: true, title: true } },
} as const;

type AssignmentRow = {
  publicId: string;
  dueAt: Date | null;
  createdAt: Date;
  class: { publicId: string; owner: { publicId: string } };
  student: { publicId: string };
  lesson: { publicId: string; title: string };
};

function toRecord(row: AssignmentRow): AssignmentRecord {
  return {
    publicId: row.publicId,
    classPublicId: row.class.publicId,
    classOwnerPublicId: row.class.owner.publicId,
    studentPublicId: row.student.publicId,
    lessonPublicId: row.lesson.publicId,
    lessonTitle: row.lesson.title,
    dueAt: row.dueAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaTeacherAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublishedLesson(lessonPublicId: string): Promise<AssignableLesson | null> {
    const row = await this.prisma.lesson.findUnique({
      where: { publicId: lessonPublicId },
      select: { publicId: true, title: true, visibility: true },
    });
    if (!row || row.visibility !== 'PUBLISHED') return null;
    return { publicId: row.publicId, title: row.title };
  }

  async exists(
    classPublicId: string,
    studentPublicId: string,
    lessonPublicId: string,
  ): Promise<boolean> {
    const count = await this.prisma.lessonAssignment.count({
      where: {
        class: { publicId: classPublicId },
        student: { publicId: studentPublicId },
        lesson: { publicId: lessonPublicId },
      },
    });
    return count > 0;
  }

  async create(input: NewAssignment): Promise<AssignmentRecord | null> {
    const [klass, student, lesson] = await Promise.all([
      this.prisma.teachingClass.findUnique({
        where: { publicId: input.classPublicId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { publicId: input.studentPublicId },
        select: { id: true },
      }),
      this.prisma.lesson.findUnique({
        where: { publicId: input.lessonPublicId },
        select: { id: true },
      }),
    ]);
    if (!klass || !student || !lesson) return null;

    try {
      const row = await this.prisma.lessonAssignment.create({
        data: {
          classId: klass.id,
          studentId: student.id,
          lessonId: lesson.id,
          dueAt: input.dueAt,
          createdAt: input.createdAt,
        },
        select: ASSIGNMENT_SELECT,
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async listForStudent(
    classPublicId: string,
    studentPublicId: string,
  ): Promise<AssignmentRecord[]> {
    const rows = await this.prisma.lessonAssignment.findMany({
      where: { class: { publicId: classPublicId }, student: { publicId: studentPublicId } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ASSIGNMENT_SELECT,
    });
    const states = await readLessonCompletions(
      this.prisma,
      rows.map((row) => ({ studentId: studentPublicId, lessonId: row.lesson.publicId })),
    );
    return rows.map((row) => ({
      ...toRecord(row),
      completion: states.get(completionKey(studentPublicId, row.lesson.publicId)),
    }));
  }
}
