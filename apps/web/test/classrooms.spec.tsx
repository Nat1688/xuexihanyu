jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '../src/api/client';
import { classroomApi, classroomError } from '../src/api/classrooms';
import { StudentWorkspace } from '../src/classrooms/StudentWorkspace';
import { ClassEnrollmentPanel } from '../src/classrooms/ClassEnrollmentPanel';

describe('CL-01 Vietnamese class UI and HTTP contract', () => {
  afterEach(() => jest.restoreAllMocks());
  it('renders separate class/assignment/progress/self-study navigation in Vietnamese', () => {
    const html = renderToStaticMarkup(
      <StudentWorkspace onExpired={() => {}} onSelfStudy={() => {}} onExercise={() => {}} />,
    );
    for (const label of [
      'Lớp của tôi',
      'Tham gia lớp',
      'Bài được giao',
      'Tiến độ',
      'Tự học',
      'Đăng xuất',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('Dashboard');
    expect(html).not.toContain('answerKey');
  });
  it('renders exact-login enrollment and single-display invitation explanation without code storage', () => {
    const html = renderToStaticMarkup(
      <ClassEnrollmentPanel
        classId="class"
        onExpired={() => {}}
        onEnrolled={() => {}}
        onBusyChange={() => {}}
      />,
    );
    expect(html).toContain('Thêm tài khoản học viên có sẵn');
    expect(html).toContain('Mã được hiển thị một lần');
    expect(html).not.toContain('CL-');
    expect(html).toContain('autoComplete="off"');
  });
  it('uses credentialed CSRF-protected POST and encodes path identifiers', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'clp_csrf=synthetic-proof' },
    });
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ ok: true }) } as Response);
    await classroomApi.join('synthetic-invitation');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/student/classes/join');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'X-CSRF-Token': 'synthetic-proof' },
      body: JSON.stringify({ code: 'synthetic-invitation' }),
    });
    await classroomApi.enroll('class/unsafe', 'student@example.invalid');
    expect(fetch.mock.calls[1][0]).toBe('/teacher/classes/class%2Funsafe/enrollments');
  });
  it('does not display raw server or Prisma error messages', () => {
    for (const status of [403, 404, 422, 500])
      expect(
        classroomError(new ApiError(status, 'UNKNOWN', 'sensitive Prisma details')),
      ).not.toContain('Prisma');
    expect(classroomError(new ApiError(422, 'CLASSROOM_INVITATION_INVALID', 'secret'))).toContain(
      'hết hạn',
    );
  });
});
