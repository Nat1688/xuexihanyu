jest.mock('../src/config/public-config', () => ({
  getPublicConfig: () => ({ apiBaseUrl: '/api' }),
}));
import { renderToStaticMarkup } from 'react-dom/server';
import { Dictionary } from '../src/dictionary/Dictionary';
import { dictionaryError, typeLabels } from '../src/dictionary/client';
import { ApiError } from '../src/api/client';
import { StudentWorkspace } from '../src/classrooms/StudentWorkspace';
import { TeacherWorkspace } from '../src/teacher/TeacherWorkspace';

describe('DICT Vietnamese native presentation', () => {
  const noop = () => undefined;
  it.each([
    ['reference', 'Từ điển tiếng Trung'],
    ['specialties', 'Tiếng Trung chuyên ngành'],
    ['admin', 'Quản lý từ điển'],
  ] as const)('renders %s as Vietnamese with textual Pinyin and no audio', (mode, title) => {
    const html = renderToStaticMarkup(<Dictionary mode={mode} onClose={noop} onExpired={noop} />);
    expect(html).toContain(title);
    expect(html).toContain('Nhập chữ Hán, Pinyin, tiếng Việt hoặc tiếng Anh');
    expect(html).not.toMatch(/<audio|speechSynthesis|microphone|Phát âm/u);
    if (mode !== 'admin') expect(html).not.toContain('type="file"');
    else expect(html).toContain('chưa xuất bản');
  });
  it('provides native Student dictionary and specialty navigation without unfinished notebook', () => {
    const html = renderToStaticMarkup(
      <StudentWorkspace
        onExpired={noop}
        onSelfStudy={noop}
        onExercise={noop}
        onDictionary={noop}
      />,
    );
    expect(html).toContain('Từ điển');
    expect(html).toContain('Tiếng Trung chuyên ngành');
    expect(html).not.toContain('Sổ tay từ vựng');
  });
  it.each(['TEACHER', 'ADMIN'])('restricts administrative navigation for %s', (role) => {
    const html = renderToStaticMarkup(
      <TeacherWorkspace
        principal={{
          publicId: 'synthetic',
          login: 'dictionary@example.invalid',
          displayName: null,
          roles: [role],
        }}
        onExpired={noop}
        onBusyChange={noop}
        onDictionary={noop}
      />,
    );
    expect(html.includes('Quản lý từ điển')).toBe(role === 'ADMIN');
    expect(html).toContain('Từ điển');
  });
  it('does not display internal enum values or raw API errors to users', () => {
    expect(Object.values(typeLabels)).toEqual([
      'Từ vựng',
      'Thuật ngữ',
      'Cụm từ',
      'Mẫu câu',
      'Chưa phân loại',
    ]);
    expect(
      dictionaryError(new ApiError(500, 'PRISMA', 'sensitive database exception')),
    ).not.toMatch(/PRISMA|sensitive|database/u);
    expect(dictionaryError(new ApiError(403, 'FORBIDDEN', 'no'))).toContain('không có quyền');
  });
});
