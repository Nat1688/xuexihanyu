import { Injectable } from '@nestjs/common';
import { LoginRateLimiter } from '../identity/application/login-rate-limiter';
import { ClassroomRepository } from './classroom.repository';
import {
  type ClassroomActor,
  ClassroomError,
  digestInvitation,
  newInvitation,
  parseInvitation,
  parseStudentLogin,
  requirePublicId,
  requireStudent,
  requireTeacher,
} from './classroom-contract';

@Injectable()
export class ClassroomService {
  private readonly joins = new LoginRateLimiter({
    windowMs: 60_000,
    maxAttempts: 5,
    maxKeys: 5000,
  });
  private readonly mutations = new LoginRateLimiter({
    windowMs: 60_000,
    maxAttempts: 20,
    maxKeys: 5000,
  });
  constructor(private readonly repository: ClassroomRepository) {}
  private limit(limiter: LoginRateLimiter, actor: ClassroomActor): void {
    if (!limiter.hit(actor.publicId).allowed)
      throw new ClassroomError(
        'CLASSROOM_RATE_LIMITED',
        429,
        'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.',
      );
  }
  invitation(actor: ClassroomActor, classId: string, now: Date) {
    requireTeacher(actor);
    requirePublicId(classId);
    return this.repository.invitation(actor, classId, now);
  }
  async rotate(actor: ClassroomActor, classId: string, now: Date) {
    requireTeacher(actor);
    requirePublicId(classId);
    this.limit(this.mutations, actor);
    const invitation = newInvitation(now);
    await this.repository.rotate(actor, classId, invitation.codeHash, invitation.expiresAt);
    return { code: invitation.code, expiresAt: invitation.expiresAt.toISOString() };
  }
  async revoke(actor: ClassroomActor, classId: string, now: Date) {
    requireTeacher(actor);
    requirePublicId(classId);
    this.limit(this.mutations, actor);
    await this.repository.revoke(actor, classId, now);
    return { ok: true };
  }
  async join(actor: ClassroomActor, raw: unknown, now: Date) {
    requireStudent(actor);
    this.limit(this.joins, actor);
    await this.repository.join(actor, digestInvitation(parseInvitation(raw)), now);
    return { ok: true };
  }
  async enroll(actor: ClassroomActor, classId: string, raw: unknown) {
    requireTeacher(actor);
    requirePublicId(classId);
    this.limit(this.mutations, actor);
    await this.repository.enroll(actor, classId, parseStudentLogin(raw));
    return { ok: true };
  }
  classes(actor: ClassroomActor) {
    requireStudent(actor);
    return this.repository.classes(actor);
  }
  progress(actor: ClassroomActor, now: Date) {
    requireStudent(actor);
    return this.repository.progress(actor, now);
  }
  assignments(actor: ClassroomActor, classId?: string) {
    requireStudent(actor);
    if (classId) requirePublicId(classId);
    return this.repository.assignments(actor, classId);
  }
}
