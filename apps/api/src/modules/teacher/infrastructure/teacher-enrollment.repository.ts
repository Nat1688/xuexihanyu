/**
 * CP-06 enrollment adapter (`class_enrollments`).
 *
 * `(class_id, student_id)` is unique — a student is enrolled at most once per
 * class. Inserts translate a unique violation (Prisma P2002) into `null` so
 * the service can answer a clean, stable "already enrolled" error under races.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import { isUniqueViolation } from './prisma-errors';
import {
  type EnrollmentRecord,
  type EnrollmentRepository,
  type StudentLookup,
} from '../application/teacher-ports';

const ENROLLMENT_SELECT = {
  enrolledAt: true,
  class: { select: { publicId: true, owner: { select: { publicId: true } } } },
  student: { select: { publicId: true, login: true } },
} as const;

@Injectable()
export class PrismaTeacherEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStudent(publicId: string): Promise<StudentLookup | null> {
    const row = await this.prisma.user.findUnique({
      where: { publicId },
      select: { publicId: true, login: true, state: true },
    });
    return row ? { publicId: row.publicId, login: row.login, state: row.state } : null;
  }

  async exists(classPublicId: string, studentPublicId: string): Promise<boolean> {
    const count = await this.prisma.classEnrollment.count({
      where: { class: { publicId: classPublicId }, student: { publicId: studentPublicId } },
    });
    return count > 0;
  }

  async enroll(
    classPublicId: string,
    studentPublicId: string,
    at: Date,
  ): Promise<EnrollmentRecord | null> {
    const [klass, student] = await Promise.all([
      this.prisma.teachingClass.findUnique({
        where: { publicId: classPublicId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({ where: { publicId: studentPublicId }, select: { id: true } }),
    ]);
    if (!klass || !student) return null;

    try {
      const row = await this.prisma.classEnrollment.create({
        data: { classId: klass.id, studentId: student.id, enrolledAt: at },
        select: ENROLLMENT_SELECT,
      });
      return {
        publicId: `${row.class.publicId}:${row.student.publicId}`,
        classPublicId: row.class.publicId,
        classOwnerPublicId: row.class.owner.publicId,
        studentPublicId: row.student.publicId,
        studentLogin: row.student.login,
        studentDisplayName: null,
        enrolledAt: row.enrolledAt,
      };
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async listByClass(classPublicId: string, limit: number): Promise<EnrollmentRecord[]> {
    const rows = await this.prisma.classEnrollment.findMany({
      where: { class: { publicId: classPublicId } },
      orderBy: [{ enrolledAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: ENROLLMENT_SELECT,
    });
    return rows.map((row) => ({
      publicId: `${row.class.publicId}:${row.student.publicId}`,
      classPublicId: row.class.publicId,
      classOwnerPublicId: row.class.owner.publicId,
      studentPublicId: row.student.publicId,
      studentLogin: row.student.login,
      studentDisplayName: null,
      enrolledAt: row.enrolledAt,
    }));
  }

  async isEnrolled(classPublicId: string, studentPublicId: string): Promise<boolean> {
    return this.exists(classPublicId, studentPublicId);
  }
}
