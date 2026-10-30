import {
  readLessonCompletions,
  completionKey,
} from '../../content/infrastructure/lesson-completion.reader';
/**
 * CP-06 class adapter (`teaching_classes`).
 *
 * A class is owned by exactly one teacher (`owner_id`); visibility decisions
 * belong to the application policy, this adapter only resolves ids server-side
 * and projects counts.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type ClassRecord,
  type ClassRepository,
  type NewClass,
} from '../application/teacher-ports';

const CLASS_SELECT = {
  publicId: true,
  title: true,
  term: true,
  createdAt: true,
  owner: { select: { publicId: true } },
  _count: { select: { enrollments: true } },
} as const;

type ClassRow = {
  publicId: string;
  title: string;
  term: string | null;
  createdAt: Date;
  owner: { publicId: string };
  _count: { enrollments: number };
};

function toRecord(row: ClassRow): ClassRecord {
  return {
    publicId: row.publicId,
    title: row.title,
    term: row.term,
    ownerPublicId: row.owner.publicId,
    createdAt: row.createdAt,
    enrollmentCount: row._count.enrollments,
  };
}

@Injectable()
export class PrismaTeacherClassRepository implements ClassRepository {
  constructor(private readonly prisma: PrismaService) {}

  async overview(ownerPublicId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const [courses, classes, students, lessons, assignments] = await Promise.all([
          tx.course.count({ where: { author: { publicId: ownerPublicId } } }),
          tx.teachingClass.count({ where: { owner: { publicId: ownerPublicId } } }),
          tx.classEnrollment.findMany({
            where: { class: { owner: { publicId: ownerPublicId } } },
            distinct: ['studentId'],
            select: { studentId: true },
          }),
          tx.lesson.count({
            where: {
              unit: { course: { author: { publicId: ownerPublicId } } },
              visibility: 'PUBLISHED',
            },
          }),
          tx.lessonAssignment.findMany({
            where: {
              class: { owner: { publicId: ownerPublicId } },
              lesson: { visibility: 'PUBLISHED' },
            },
            select: {
              student: { select: { publicId: true } },
              lesson: { select: { publicId: true } },
            },
          }),
        ]);
        const states = await readLessonCompletions(
          tx,
          assignments.map((row) => ({
            studentId: row.student.publicId,
            lessonId: row.lesson.publicId,
          })),
        );
        const completed = assignments.filter(
          (row) => states.get(completionKey(row.student.publicId, row.lesson.publicId))?.completed,
        ).length;
        return {
          courses,
          classes,
          students: students.length,
          lessons,
          assignments: assignments.length,
          completed,
          pending: assignments.length - completed,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }

  async update(publicId: string, title: string, term: string | null): Promise<ClassRecord> {
    return toRecord(
      await this.prisma.teachingClass.update({
        where: { publicId },
        data: { title, term },
        select: CLASS_SELECT,
      }),
    );
  }
  async create(input: NewClass): Promise<ClassRecord | null> {
    const owner = await this.prisma.user.findUnique({
      where: { publicId: input.ownerPublicId },
      select: { id: true },
    });
    if (!owner) return null;
    const row = await this.prisma.teachingClass.create({
      data: { ownerId: owner.id, title: input.title, term: input.term },
      select: CLASS_SELECT,
    });
    return toRecord(row);
  }

  async listOwned(ownerPublicId: string): Promise<ClassRecord[]> {
    const rows = await this.prisma.teachingClass.findMany({
      where: { owner: { publicId: ownerPublicId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: CLASS_SELECT,
    });
    return rows.map(toRecord);
  }

  async findByPublicId(publicId: string): Promise<ClassRecord | null> {
    const row = await this.prisma.teachingClass.findUnique({
      where: { publicId },
      select: CLASS_SELECT,
    });
    return row ? toRecord(row) : null;
  }
}
