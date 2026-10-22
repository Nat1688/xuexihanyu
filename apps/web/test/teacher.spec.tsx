jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError, type Principal } from '../src/api/client';
import { teacherApi, type StudentDetail } from '../src/api/teacher';
import { canStudy, canTeach, teacherError } from '../src/teacher/model';
import { ClassCards, ResourceView, Roster, StudentRecord } from '../src/teacher/TeacherViews';

const principal = (roles: string[]): Principal => ({
  publicId: 'public',
  login: 'synthetic',
  displayName: null,
  roles,
});
const emptyDetail: StudentDetail = {
  studentId: 'student-public',
  login: 'synthetic',
  displayName: '<script>unsafe</script>',
  assignments: [],
  progress: {
    studentId: 'student-public',
    classId: 'class-public',
    evidence: {
      window: { from: '2026-10-01T00:00:00Z', to: '2026-10-31T00:00:00Z', days: 30 },
      totalEvents: 0,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      accuracy: null,
      assignedLessons: 0,
      itemsWithEvidence: 0,
    },
    weakItems: [],
  },
  recentEvidence: [],
};

describe('TW-01 component rendering and navigation policy', () => {
  it('admits teacher/admin navigation but not student-only accounts', () => {
    expect(canTeach(principal(['STUDENT']))).toBe(false);
    expect(canTeach(principal(['TEACHER']))).toBe(true);
    expect(canTeach(principal(['ADMIN']))).toBe(true);
    expect(canStudy(principal(['TEACHER']))).toBe(false);
    expect(canStudy(principal(['STUDENT', 'TEACHER']))).toBe(true);
  });
  it('renders loading, error, and ready states independently', () => {
    expect(
      renderToStaticMarkup(
        <ResourceView state={{ status: 'loading' }} retry={() => {}}>
          {() => 'private'}
        </ResourceView>,
      ),
    ).toContain('role="status"');
    const error = renderToStaticMarkup(
      <ResourceView
        state={{ status: 'error', error: new ApiError(403, 'FORBIDDEN', 'sensitive raw text') }}
        retry={() => {}}
      >
        {() => 'private'}
      </ResourceView>,
    );
    expect(error).toContain('permission');
    expect(error).not.toContain('sensitive raw text');
    expect(error).not.toContain('private');
    expect(
      renderToStaticMarkup(
        <ResourceView state={{ status: 'ready', data: 4 }} retry={() => {}}>
          {(n) => <span>{n}</span>}
        </ResourceView>,
      ),
    ).toBe('<span>4</span>');
  });
  it('renders useful class and roster empty states', () => {
    expect(renderToStaticMarkup(<ClassCards classes={[]} onOpen={() => {}} />)).toContain(
      'Create a class',
    );
    expect(renderToStaticMarkup(<Roster students={[]} onOpen={() => {}} />)).toContain(
      'No students enrolled',
    );
  });
  it('escapes student content, hides IDs and does not invent completion or accuracy', () => {
    const html = renderToStaticMarkup(<StudentRecord detail={emptyDetail} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('student-public');
    expect(html).not.toContain('class-public');
    expect(html).not.toContain('0%');
    expect(html).toContain('not a grade');
    expect(html).toContain('does not mean the student has failed or completed');
    expect(html).toContain('rule/version are unavailable');
  });
  it.each([400, 401, 403, 404, 409, 422, 500])('uses safe messages for HTTP %s', (status) => {
    expect(teacherError(new ApiError(status, 'ERROR', 'private payload'))).not.toContain(
      'private payload',
    );
  });
  it('recognizes the actual identity CSRF error code before the generic 403', () => {
    expect(teacherError(new ApiError(403, 'AUTH_CSRF_INVALID', 'ignored'))).toContain(
      'Security check failed',
    );
  });
});

describe('TW-01 wire contract', () => {
  const fetchMock = jest.fn();
  const oldFetch = globalThis.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    globalThis.fetch = fetchMock;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'clp_csrf=synthetic-proof' },
    });
  });
  afterAll(() => {
    globalThis.fetch = oldFetch;
    Reflect.deleteProperty(globalThis, 'document');
  });
  it('uses the exact class, roster and student detail endpoints', async () => {
    await teacherApi.classes();
    await teacherApi.roster('a/b');
    await teacherApi.detail('class', 'student');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/teacher/classes',
      '/teacher/classes/a%2Fb/roster',
      '/teacher/classes/class/students/student',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(init.credentials).toBe('include');
      expect(init.cache).toBe('no-store');
      expect(init.headers['X-CSRF-Token']).toBeUndefined();
    }
  });
  it('posts only assignment DTO fields with session-bound CSRF proof', async () => {
    await teacherApi.assign('class', 'student', 'lesson', null);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/teacher/classes/class/assignments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      studentId: 'student',
      lessonId: 'lesson',
      dueAt: null,
    });
    expect(init.headers['X-CSRF-Token']).toBe('synthetic-proof');
    expect(init.credentials).toBe('include');
  });
  it('posts class title/term without a caller-controlled owner', async () => {
    await teacherApi.createClass('New class', null);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: 'New class', term: null });
  });
  it('reads only course/unit/lesson metadata, not item answers', async () => {
    await teacherApi.courses();
    await teacherApi.units('c');
    await teacherApi.lessons('u');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/content/courses',
      '/content/courses/c/units',
      '/content/units/u/lessons',
    ]);
  });
  it('propagates rejected mutation without automatic retries', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: 'TEACHER_ASSIGNMENT_EXISTS', message: 'Already assigned' },
      }),
    });
    await expect(teacherApi.assign('c', 's', 'l', null)).rejects.toMatchObject({
      status: 409,
      code: 'TEACHER_ASSIGNMENT_EXISTS',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
