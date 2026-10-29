import { ApiError, request, type ExerciseView } from './client';
export interface EnrolledClass {
  classId: string;
  title: string;
  term: string | null;
  enrolledAt: string;
}
export interface ClassAssignment {
  assignmentId: string;
  classId: string;
  classTitle: string;
  lessonId: string;
  lessonTitle: string;
  dueAt: string | null;
}
export interface ClassProgress {
  days: number;
  assignedLessons: number;
  attempts: number;
  correct: number;
  incorrect: number;
  from: string;
  to: string;
}
export interface Invitation {
  state: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  expiresAt: string | null;
}
const segment = encodeURIComponent;
const teacherClass = (id: string) => `/teacher/classes/${segment(id)}`;
export const classroomApi = {
  classes: () => request<{ classes: EnrolledClass[] }>('GET', '/student/classes'),
  assignments: () => request<{ assignments: ClassAssignment[] }>('GET', '/student/assignments'),
  progress: () => request<ClassProgress>('GET', '/student/progress'),
  join: (code: string) => request<{ ok: boolean }>('POST', '/student/classes/join', { code }),
  start: (assignment: ClassAssignment) =>
    request<ExerciseView>(
      'POST',
      `/student/classes/${segment(assignment.classId)}/assignments/${segment(assignment.assignmentId)}/exercises/next`,
    ),
  invitation: (id: string) => request<Invitation>('GET', `${teacherClass(id)}/invitation`),
  rotate: (id: string) =>
    request<{ code: string; expiresAt: string }>('POST', `${teacherClass(id)}/invitation`),
  revoke: (id: string) => request<{ ok: boolean }>('POST', `${teacherClass(id)}/invitation/revoke`),
  enroll: (id: string, login: string) =>
    request<{ ok: boolean }>('POST', `${teacherClass(id)}/enrollments`, { login }),
};
export function classroomError(error: unknown): string {
  const messages: Record<string, string> = {
    CLASSROOM_INVITATION_INVALID:
      'Mã tham gia không hợp lệ hoặc đã hết hạn. Hãy xin mã mới từ giáo viên.',
    CLASSROOM_ALREADY_ENROLLED: 'Học viên đã tham gia lớp này. Hãy tải lại danh sách lớp.',
    CLASSROOM_STUDENT_UNAVAILABLE:
      'Không thể thêm tài khoản này. Hãy kiểm tra tên đăng nhập và quyền học viên.',
    CLASSROOM_RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.',
  };
  if (error instanceof ApiError) {
    if (messages[error.code]) return messages[error.code];
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.status === 404) return 'Không tìm thấy nội dung hoặc bạn không có quyền truy cập.';
  }
  return 'Không thể hoàn tất yêu cầu. Hãy tải lại dữ liệu để kiểm tra trước khi thử lại.';
}
