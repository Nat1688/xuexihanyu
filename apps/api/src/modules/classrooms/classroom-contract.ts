import { createHash, randomBytes } from 'node:crypto';
import { normalizeLogin } from '../identity/domain/login';
import { type Role } from '../identity/domain/role';

export interface ClassroomActor {
  publicId: string;
  roles: readonly Role[];
}
export class ClassroomError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function unavailable(): never {
  throw new ClassroomError('CLASSROOM_NOT_FOUND', 404, 'Không tìm thấy lớp hoặc bài được giao.');
}
export function invalidInvitation(): never {
  throw new ClassroomError(
    'CLASSROOM_INVITATION_INVALID',
    422,
    'Mã tham gia không hợp lệ hoặc đã hết hạn.',
  );
}
export function duplicateEnrollment(): never {
  throw new ClassroomError('CLASSROOM_ALREADY_ENROLLED', 409, 'Học viên đã tham gia lớp này.');
}
export function requireTeacher(actor: ClassroomActor): void {
  if (!actor.roles.some((role) => role === 'TEACHER' || role === 'ADMIN')) unavailable();
}
export function requireStudent(actor: ClassroomActor): void {
  if (!actor.roles.includes('STUDENT')) unavailable();
}
export function requirePublicId(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) unavailable();
}
export function newInvitation(now: Date) {
  const code = `CL-${randomBytes(24).toString('base64url')}`;
  return {
    code,
    codeHash: digestInvitation(code),
    expiresAt: new Date(now.getTime() + 86_400_000),
  };
}
export function digestInvitation(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}
export function parseInvitation(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 64) invalidInvitation();
  const code = raw.trim();
  if (!/^CL-[A-Za-z0-9_-]{32}$/.test(code)) invalidInvitation();
  return code;
}
export function parseStudentLogin(raw: unknown): string {
  try {
    if (typeof raw !== 'string') throw new Error();
    return normalizeLogin(raw);
  } catch {
    throw new ClassroomError(
      'CLASSROOM_STUDENT_UNAVAILABLE',
      422,
      'Không thể thêm tài khoản học viên này.',
    );
  }
}
export interface InvitationView {
  state: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NONE';
  expiresAt: string | null;
}
export interface EnrolledClassView {
  classId: string;
  title: string;
  term: string | null;
  enrolledAt: string;
}
export interface ClassAssignmentView {
  assignmentId: string;
  classId: string;
  classTitle: string;
  lessonId: string;
  lessonTitle: string;
  dueAt: string | null;
}
