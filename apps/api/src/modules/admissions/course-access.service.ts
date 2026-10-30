import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../foundation/prisma.service';

export interface AdmissionActor {
  publicId: string;
  roles: readonly string[];
}

/** Exported admissions application boundary. Never trusts client course/role claims. */
@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async courseIds(actor: AdmissionActor): Promise<string[] | null> {
    if (actor.roles.some((r) => r === 'ADMIN' || r === 'TEACHER')) return null;
    if (!actor.roles.includes('STUDENT')) return [];
    const rows = await this.prisma.courseApplication.findMany({
      where: { student: { publicId: actor.publicId, state: 'ACTIVE' }, status: 'APPROVED' },
      select: { course: { select: { publicId: true } } },
    });
    return rows.map((r) => r.course.publicId);
  }
  async assert(actor: AdmissionActor, kind: 'course' | 'unit' | 'lesson', publicId: string) {
    const ids = await this.courseIds(actor);
    if (ids === null) return;
    let courseId: string | undefined;
    if (kind === 'course') courseId = publicId;
    if (kind === 'unit')
      courseId = (
        await this.prisma.unit.findUnique({
          where: { publicId },
          select: { course: { select: { publicId: true } } },
        })
      )?.course.publicId;
    if (kind === 'lesson')
      courseId = (
        await this.prisma.lesson.findUnique({
          where: { publicId },
          select: { unit: { select: { course: { select: { publicId: true } } } } },
        })
      )?.unit.course.publicId;
    if (!courseId || !ids.includes(courseId))
      throw new NotFoundException({
        error: {
          code: 'COURSE_ACCESS_REQUIRED',
          message: 'Bạn cần được duyệt tham gia khóa học này.',
        },
      });
  }
}
