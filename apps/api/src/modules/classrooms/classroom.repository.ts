import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../foundation/prisma.service';
import { canReadClass } from '../teacher/domain/teacher-policy';
import {
  type ClassroomActor,
  type ClassAssignmentView,
  type EnrolledClassView,
  type InvitationView,
  ClassroomError,
  duplicateEnrollment,
  invalidInvitation,
  unavailable,
} from './classroom-contract';

/** All writes share one transaction/connection. The class lock orders join/revoke/rotation. */
@Injectable()
export class ClassroomRepository {
  constructor(private readonly db: PrismaService) {}
  private async ownedClass(tx: Prisma.TransactionClient, actor: ClassroomActor, classId: string) {
    await tx.$queryRaw`SELECT id FROM teaching_classes WHERE public_id = ${classId}::uuid FOR UPDATE`;
    const row = await tx.teachingClass.findUnique({
      where: { publicId: classId },
      include: { owner: true },
    });
    if (!row || !canReadClass(actor.publicId, actor.roles, row.owner.publicId)) unavailable();
    return row;
  }
  async invitation(actor: ClassroomActor, classId: string, now: Date): Promise<InvitationView> {
    const row = await this.db.teachingClass.findFirst({
      where: {
        publicId: classId,
        ...(actor.roles.includes('ADMIN') ? {} : { owner: { publicId: actor.publicId } }),
      },
      include: { invitation: true },
    });
    if (!row) unavailable();
    const invite = row.invitation;
    return {
      state: !invite
        ? 'NONE'
        : invite.revokedAt
          ? 'REVOKED'
          : invite.expiresAt <= now
            ? 'EXPIRED'
            : 'ACTIVE',
      expiresAt: invite?.expiresAt.toISOString() ?? null,
    };
  }
  async rotate(
    actor: ClassroomActor,
    classId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.ownedClass(tx, actor, classId);
      await tx.classInvitation.upsert({
        where: { classId: row.id },
        create: { classId: row.id, codeHash, expiresAt },
        update: { codeHash, expiresAt, revokedAt: null },
      });
    });
  }
  async revoke(actor: ClassroomActor, classId: string, now: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.ownedClass(tx, actor, classId);
      await tx.classInvitation.updateMany({ where: { classId: row.id }, data: { revokedAt: now } });
    });
  }
  private async addEnrollment(tx: Prisma.TransactionClient, classId: string, studentId: string) {
    if (
      await tx.classEnrollment.findUnique({ where: { classId_studentId: { classId, studentId } } })
    )
      duplicateEnrollment();
    const inserted = await tx.classEnrollment.createMany({
      data: [{ classId, studentId }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) duplicateEnrollment();
  }
  async join(actor: ClassroomActor, codeHash: string, now: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const hint = await tx.classInvitation.findUnique({
        where: { codeHash },
        select: { classId: true },
      });
      if (!hint) invalidInvitation();
      await tx.$queryRaw`SELECT id FROM teaching_classes WHERE id = ${hint.classId}::uuid FOR UPDATE`;
      // A request can wait on the class lock past expiry. Recheck against the
      // database clock after acquiring it, not only the request-start instant.
      const [clock] = await tx.$queryRaw<
        { checkedAt: Date }[]
      >`SELECT clock_timestamp() AS "checkedAt"`;
      const checkedAt = new Date(Math.max(now.getTime(), clock.checkedAt.getTime()));
      const current = await tx.classInvitation.findUnique({ where: { classId: hint.classId } });
      if (
        !current ||
        current.codeHash !== codeHash ||
        current.revokedAt ||
        current.expiresAt <= checkedAt
      )
        invalidInvitation();
      const student = await tx.user.findFirst({
        where: { publicId: actor.publicId, state: 'ACTIVE', roles: { some: { role: 'STUDENT' } } },
        select: { id: true },
      });
      if (!student) unavailable();
      await this.addEnrollment(tx, current.classId, student.id);
    });
  }
  async enroll(actor: ClassroomActor, classId: string, login: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.ownedClass(tx, actor, classId);
      const student = await tx.user.findFirst({
        where: { loginNormalized: login, state: 'ACTIVE', roles: { some: { role: 'STUDENT' } } },
        select: { id: true },
      });
      if (!student)
        throw new ClassroomError(
          'CLASSROOM_STUDENT_UNAVAILABLE',
          422,
          'Không thể thêm tài khoản học viên này.',
        );
      await this.addEnrollment(tx, row.id, student.id);
    });
  }
  async classes(actor: ClassroomActor): Promise<EnrolledClassView[]> {
    const rows = await this.db.classEnrollment.findMany({
      where: { student: { publicId: actor.publicId } },
      include: { class: true },
      orderBy: [{ enrolledAt: 'desc' }, { publicId: 'asc' }],
    });
    return rows.map((row) => ({
      classId: row.class.publicId,
      title: row.class.title,
      term: row.class.term,
      enrolledAt: row.enrolledAt.toISOString(),
    }));
  }
  async progress(actor: ClassroomActor, now: Date) {
    const assignments = await this.assignments(actor);
    const lessonIds = [...new Set(assignments.map((row) => row.lessonId))];
    const from = new Date(now.getTime() - 30 * 86_400_000);
    const where = {
      actor: { publicId: actor.publicId },
      lesson: { publicId: { in: lessonIds } },
      type: 'ANSWER_SUBMITTED' as const,
      occurredAt: { gte: from, lt: now },
    };
    const [correct, incorrect] = await Promise.all(
      ['correct', 'incorrect'].map((outcome) =>
        this.db.learningEvent.count({
          where: { ...where, metadata: { path: ['outcome'], equals: outcome } },
        }),
      ),
    );
    return {
      from: from.toISOString(),
      to: now.toISOString(),
      days: 30,
      assignedLessons: lessonIds.length,
      attempts: correct + incorrect,
      correct,
      incorrect,
    };
  }

  async assignments(actor: ClassroomActor, classId?: string): Promise<ClassAssignmentView[]> {
    if (
      classId &&
      !(await this.db.classEnrollment.findFirst({
        where: { class: { publicId: classId }, student: { publicId: actor.publicId } },
        select: { id: true },
      }))
    )
      unavailable();
    const rows = await this.db.lessonAssignment.findMany({
      where: {
        student: { publicId: actor.publicId },
        class: {
          ...(classId ? { publicId: classId } : {}),
          enrollments: { some: { student: { publicId: actor.publicId } } },
        },
        lesson: { visibility: 'PUBLISHED' },
      },
      include: { class: true, lesson: true },
      orderBy: [{ createdAt: 'desc' }, { publicId: 'asc' }],
    });
    return rows.map((row) => ({
      assignmentId: row.publicId,
      classId: row.class.publicId,
      classTitle: row.class.title,
      lessonId: row.lesson.publicId,
      lessonTitle: row.lesson.title,
      dueAt: row.dueAt?.toISOString() ?? null,
    }));
  }
}
