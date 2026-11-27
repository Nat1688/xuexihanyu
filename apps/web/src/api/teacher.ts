import { request } from './client';

/** CP-06 HTTP projections, not persistence models. IDs below are public UUIDs. */
export interface TeacherClass {
  classId: string;
  title: string;
  term: string | null;
  enrolled: number;
  createdAt: string;
}
export interface RosterStudent {
  studentId: string;
  login: string;
  displayName: string | null;
  enrolledAt: string;
}
export interface Assignment {
  completion?: { total: number; correct: number; completed: boolean };
  assignmentId: string;
  studentId: string;
  lessonId: string;
  lessonTitle: string;
  dueAt: string | null;
  createdAt: string;
}
export interface Progress {
  studentId: string;
  classId: string;
  evidence: {
    window: { from: string; to: string; days: number };
    totalEvents: number;
    attempts: number;
    correct: number;
    incorrect: number;
    accuracy: number | null;
    assignedLessons: number;
    itemsWithEvidence: number;
  };
  weakItems: Array<{
    itemId: string;
    state: string;
    correct: number;
    incorrect: number;
    dueAt: string | null;
  }>;
}
export interface StudentDetail {
  studentId: string;
  login: string;
  displayName: string | null;
  assignments: Assignment[];
  progress: Progress;
  recentEvidence: Array<{
    eventId: string;
    type: string;
    occurredAt: string;
    accepted: boolean | null;
    lessonId: string | null;
    itemId: string | null;
  }>;
}
export interface ContentNode {
  publicId: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: string;
  position: number;
}
const segment = encodeURIComponent;
const classPath = (classId: string) => `/teacher/classes/${segment(classId)}`;

export const teacherApi = {
  editClass: (classId: string, title: string, term: string | null) =>
    request<TeacherClass>('POST', `${classPath(classId)}/save`, { title, term }),
  overview: () =>
    request<{
      courses: number;
      classes: number;
      students: number;
      lessons: number;
      assignments: number;
      completed: number;
      pending: number;
    }>('GET', '/teacher/overview'),
  classes: () => request<{ classes: TeacherClass[] }>('GET', '/teacher/classes'),
  createClass: (title: string, term: string | null) =>
    request<TeacherClass>('POST', '/teacher/classes', { title, term }),
  roster: (classId: string) =>
    request<{ students: RosterStudent[] }>('GET', `${classPath(classId)}/roster`),
  detail: (classId: string, studentId: string) =>
    request<StudentDetail>('GET', `${classPath(classId)}/students/${segment(studentId)}`),
  assign: (classId: string, studentId: string, lessonId: string, dueAt: string | null) =>
    request<Assignment>('POST', `${classPath(classId)}/assignments`, {
      studentId,
      lessonId,
      dueAt,
    }),
  courses: () => request<ContentNode[]>('GET', '/content/courses'),
  units: (courseId: string) =>
    request<ContentNode[]>('GET', `/content/courses/${segment(courseId)}/units`),
  lessons: (unitId: string) =>
    request<ContentNode[]>('GET', `/content/units/${segment(unitId)}/lessons`),
};
