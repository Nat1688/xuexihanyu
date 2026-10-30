import { Injectable, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../foundation/prisma.service';
import { LoginRateLimiter } from '../identity/application/login-rate-limiter';
import { type AdmissionActor } from './course-access.service';

const selection = {
  publicId: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  reason: true,
  course: { select: { publicId: true, title: true } },
  student: { select: { publicId: true, login: true } },
  class: { select: { publicId: true, title: true } },
} as const;
export function admissionError(status: number, code: string, message: string): never {
  throw new HttpException({ error: { code, message } }, status);
}
function uuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
    admissionError(422, 'ADMISSION_INVALID', 'Mã yêu cầu không hợp lệ.');
}
function teacher(actor: AdmissionActor) {
  if (!actor.roles.some((r) => r === 'ADMIN' || r === 'TEACHER'))
    admissionError(403, 'FORBIDDEN', 'Bạn không có quyền duyệt yêu cầu.');
}
function student(actor: AdmissionActor) {
  if (!actor.roles.includes('STUDENT'))
    admissionError(403, 'FORBIDDEN', 'Chức năng dành cho học sinh.');
}
@Injectable()
export class AdmissionsService {
  private readonly limiter = new LoginRateLimiter({
    windowMs: 60_000,
    maxAttempts: 20,
    maxKeys: 5000,
  });
  constructor(private readonly prisma: PrismaService) {}
  private limit(actor: AdmissionActor) {
    if (!this.limiter.hit(actor.publicId).allowed)
      admissionError(
        429,
        'ADMISSION_RATE_LIMITED',
        'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.',
      );
  }
  async catalog(actor: AdmissionActor) {
    student(actor);
    const courses = await this.prisma.course.findMany({
      where: { visibility: 'PUBLISHED' },
      select: { publicId: true, title: true, description: true },
      orderBy: [{ position: 'asc' }, { publicId: 'asc' }],
      take: 200,
    });
    const [live, history] = await Promise.all([
      this.prisma.courseApplication.findMany({
        where: { student: { publicId: actor.publicId }, status: { in: ['PENDING', 'APPROVED'] } },
        select: selection,
        orderBy: [{ createdAt: 'desc' }, { publicId: 'asc' }],
        take: 500,
      }),
      this.prisma.courseApplication.findMany({
        where: { student: { publicId: actor.publicId }, status: { in: ['REJECTED', 'CANCELLED'] } },
        select: selection,
        orderBy: [{ createdAt: 'desc' }, { publicId: 'asc' }],
        take: 500,
      }),
    ]);
    const applications = [...live, ...history].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || a.publicId.localeCompare(b.publicId),
    );
    return { courses, applications };
  }
  async apply(actor: AdmissionActor, courseId: unknown) {
    student(actor);
    uuid(courseId);
    this.limit(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [user, course] = await Promise.all([
          tx.user.findUnique({
            where: { publicId: actor.publicId },
            select: { id: true, state: true },
          }),
          tx.course.findFirst({
            where: { publicId: courseId, visibility: 'PUBLISHED' },
            select: { id: true },
          }),
        ]);
        if (!user || user.state !== 'ACTIVE' || !course)
          admissionError(404, 'ADMISSION_UNAVAILABLE', 'Không thể đăng ký khóa học này.');
        return tx.courseApplication.create({
          data: { studentId: user.id, courseId: course.id },
          select: selection,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        admissionError(
          409,
          'ADMISSION_DUPLICATE',
          'Bạn đã gửi yêu cầu hoặc đã được duyệt khóa học này.',
        );
      throw e;
    }
  }
  async cancel(actor: AdmissionActor, id: string) {
    student(actor);
    uuid(id);
    this.limit(actor);
    const changed = await this.prisma.courseApplication.updateMany({
      where: { publicId: id, student: { publicId: actor.publicId }, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
    if (changed.count !== 1)
      admissionError(409, 'ADMISSION_UNAVAILABLE', 'Yêu cầu không còn ở trạng thái chờ duyệt.');
    return { ok: true };
  }
  async queue(actor: AdmissionActor) {
    teacher(actor);
    const owner = actor.roles.includes('ADMIN') ? {} : { owner: { publicId: actor.publicId } };
    const courses = actor.roles.includes('ADMIN') ? {} : { author: { publicId: actor.publicId } };
    const [applications, classes] = await Promise.all([
      this.prisma.courseApplication.findMany({
        where: { course: courses },
        select: selection,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { publicId: 'asc' }],
        take: 200,
      }),
      this.prisma.teachingClass.findMany({
        where: owner,
        select: { publicId: true, title: true },
        orderBy: [{ title: 'asc' }, { publicId: 'asc' }],
        take: 200,
      }),
    ]);
    return { applications, classes };
  }
  async decide(
    actor: AdmissionActor,
    id: string,
    body: { decision?: unknown; classId?: unknown; reason?: unknown },
  ) {
    teacher(actor);
    uuid(id);
    this.limit(actor);
    if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED')
      admissionError(422, 'ADMISSION_INVALID', 'Chọn duyệt hoặc từ chối.');
    const status = body.decision;
    if (
      body.reason !== undefined &&
      (typeof body.reason !== 'string' || body.reason.trim().length > 500)
    )
      admissionError(422, 'ADMISSION_INVALID', 'Lý do tối đa 500 ký tự.');
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null;
    if (status === 'APPROVED') uuid(body.classId);
    const classPublicId = status === 'APPROVED' ? (body.classId as string) : null;
    return this.prisma.$transaction(async (tx) => {
      const reviewer = await tx.user.findUnique({
        where: { publicId: actor.publicId },
        select: { id: true },
      });
      const row = await tx.courseApplication.findFirst({
        where: {
          publicId: id,
          ...(actor.roles.includes('ADMIN')
            ? {}
            : { course: { author: { publicId: actor.publicId } } }),
        },
        include: {
          student: { select: { state: true, roles: { select: { role: true } } } },
          course: { select: { visibility: true } },
        },
      });
      if (!reviewer || !row)
        admissionError(404, 'ADMISSION_UNAVAILABLE', 'Không tìm thấy yêu cầu.');
      if (row.status !== 'PENDING')
        admissionError(409, 'ADMISSION_DECIDED', 'Yêu cầu đã được xử lý. Hãy tải lại danh sách.');
      let classId: string | null = null;
      if (status === 'APPROVED') {
        if (
          row.student.state !== 'ACTIVE' ||
          !row.student.roles.some((r) => r.role === 'STUDENT') ||
          row.course.visibility !== 'PUBLISHED'
        )
          admissionError(
            409,
            'ADMISSION_UNAVAILABLE',
            'Học sinh hoặc khóa học hiện không thể được duyệt.',
          );
        const klass = await tx.teachingClass.findFirst({
          where: {
            publicId: classPublicId!,
            ...(actor.roles.includes('ADMIN') ? {} : { owner: { publicId: actor.publicId } }),
          },
          select: { id: true },
        });
        if (!klass)
          admissionError(404, 'ADMISSION_CLASS_UNAVAILABLE', 'Không thể xếp vào lớp đã chọn.');
        classId = klass.id;
      }
      // Compare-and-set before membership: two reviewers cannot both decide or partially enroll.
      const changed = await tx.courseApplication.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status, decidedAt: new Date(), reviewerId: reviewer.id, classId, reason },
      });
      if (changed.count !== 1) admissionError(409, 'ADMISSION_DECIDED', 'Yêu cầu đã được xử lý.');
      if (classId)
        await tx.classEnrollment.upsert({
          where: { classId_studentId: { classId, studentId: row.studentId } },
          create: { classId, studentId: row.studentId },
          update: {},
        });
      return { ok: true };
    });
  }
}
