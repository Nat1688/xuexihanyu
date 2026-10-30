jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherWorkspace } from '../src/teacher/TeacherWorkspace';
import { AssignmentForm } from '../src/teacher/TeacherForms';
import { ClassCards } from '../src/teacher/TeacherViews';
import { Curriculum } from '../src/curriculum/Curriculum';
const noop = () => {};
describe('CORE-01-FIX-01 discoverable authoring/assignment flow', () => {
  it('exposes an explicit assignment navigation and authoring shortcut on teacher dashboard', () => {
    const html = renderToStaticMarkup(
      <TeacherWorkspace
        principal={{
          publicId: 'teacher',
          login: 'teacher@example.invalid',
          displayName: null,
          roles: ['TEACHER'],
        }}
        onExpired={noop}
        onBusyChange={noop}
      />,
    );
    expect(html).toContain('Giao bài');
    expect(html).toContain('+ Soạn bài học');
  });
  it('explains the first authoring step before any curriculum exists', () => {
    const html = renderToStaticMarkup(
      <Curriculum onExpired={noop} onBusyChange={noop} onDirtyChange={noop} onAssign={noop} />,
    );
    expect(html).toContain('Bước 1/3');
    expect(html).toContain('Chọn khóa học đã có');
  });
  it('offers a route to authoring directly from the assignment form', () => {
    const html = renderToStaticMarkup(
      <AssignmentForm
        classId="class"
        studentId={['student']}
        onExpired={noop}
        onSaved={noop}
        onAuthor={noop}
      />,
    );
    expect(html).toContain('Soạn và xuất bản bài học');
    expect(html).toContain('Chưa có bài học?');
  });
  it('labels class cards with the task action on the assignment picker', () => {
    const html = renderToStaticMarkup(
      <ClassCards
        classes={[
          {
            classId: 'class',
            title: 'Lớp A',
            term: null,
            enrolled: 1,
            createdAt: '2026-10-30T00:00:00Z',
          },
        ]}
        onOpen={noop}
        actionLabel="Giao bài cho lớp →"
      />,
    );
    expect(html).toContain('Giao bài cho lớp');
    expect(html).toContain('Lớp A');
  });
});
