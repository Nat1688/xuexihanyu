import { request } from '../api/client';
export type Application = {
  publicId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
  course: { publicId: string; title: string };
  student: { publicId: string; login: string };
  class: { publicId: string; title: string } | null;
};
export type Catalog = {
  courses: { publicId: string; title: string; description: string | null }[];
  applications: Application[];
};
export type ReviewQueue = {
  applications: Application[];
  classes: { publicId: string; title: string }[];
};
export const admissionsApi = {
  catalog: () => request<Catalog>('GET', '/admissions/courses'),
  apply: (courseId: string) => request('POST', '/admissions/applications', { courseId }),
  cancel: (id: string) =>
    request('POST', `/admissions/applications/${encodeURIComponent(id)}/cancel`),
  review: () => request<ReviewQueue>('GET', '/admissions/review'),
  decide: (id: string, decision: 'APPROVED' | 'REJECTED', classId: string, reason: string) =>
    request('POST', `/admissions/applications/${encodeURIComponent(id)}/decision`, {
      decision,
      classId,
      reason,
    }),
};

export function currentApplication(applications: Application[], courseId: string) {
  const rows = applications.filter((a) => a.course.publicId === courseId);
  return (
    rows.find((a) => a.status === 'PENDING' || a.status === 'APPROVED') ??
    rows.sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.publicId.localeCompare(b.publicId),
    )[0]
  );
}
