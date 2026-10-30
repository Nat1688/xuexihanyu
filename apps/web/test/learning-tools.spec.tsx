jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LearningTools,
  AN2_HOME_URL,
  AN2_WORKSHEET_URL,
} from '../src/learning-tools/LearningTools';
import { PINYIN_STUDIO_HTML } from '../src/learning-tools/pinyin-studio';
import { TeacherWorkspace } from '../src/teacher/TeacherWorkspace';
import { StudentWorkspace } from '../src/classrooms/StudentWorkspace';
const noop = () => {};
describe('TOOLS-01 independent learning tools', () => {
  it('shows Vietnamese choices without loading any iframe or external resource initially', () => {
    const html = renderToStaticMarkup(<LearningTools onClose={noop} />);
    expect(html).toContain('Mở Pinyin Studio');
    expect(html).toContain('Mở công cụ tạo giấy tập viết');
    expect(html).toContain('Quay lại học tập');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('src="https:');
  });
  it('exposes tools to both teacher and student workspaces', () => {
    const teacher = renderToStaticMarkup(
      <TeacherWorkspace
        principal={{
          publicId: 'synthetic',
          login: 'teacher@example.invalid',
          displayName: null,
          roles: ['TEACHER'],
        }}
        onExpired={noop}
        onBusyChange={noop}
        onTools={noop}
      />,
    );
    const student = renderToStaticMarkup(
      <StudentWorkspace onExpired={noop} onSelfStudy={noop} onExercise={noop} onTools={noop} />,
    );
    expect(teacher).toContain('Công cụ học tập');
    expect(student).toContain('Công cụ học tập');
  });
  it('retains upstream syllable data and attribution while restricting requests from embedded HTML', () => {
    const match = PINYIN_STUDIO_HTML.match(/const GRID = (.*);/);
    expect(match).not.toBeNull();
    const grid = JSON.parse(match![1]) as Record<string, Record<string, string>>;
    expect(Object.values(grid).flatMap((row) => Object.values(row))).toHaveLength(406);
    expect(PINYIN_STUDIO_HTML).toContain('qhmusiccorner/Chinese-HSK');
    expect(PINYIN_STUDIO_HTML).toContain('Bản quyền các bản ghi chưa được xác nhận');
    expect(PINYIN_STUDIO_HTML).toContain('name="referrer" content="no-referrer"');
    expect(PINYIN_STUDIO_HTML).toContain("connect-src 'none'");
    expect(PINYIN_STUDIO_HTML).toContain('speechSynthesis');
  });
  it('uses fixed public provider URLs with no student identifiers or app context', () => {
    for (const value of [AN2_HOME_URL, AN2_WORKSHEET_URL]) {
      const url = new URL(value);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('www.an2.net');
      expect(url.search + url.hash + url.username + url.password).toBe('');
    }
  });
});
