jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
jest.mock('../src/teacher/teacher.css', () => ({}));
jest.mock('../src/lesson-preview/LessonReader.css', () => ({}));
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError, type ResultView } from '../src/api/client';
import { LoginScreen } from '../src/screens/LoginScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { CreateClassForm } from '../src/teacher/TeacherForms';
import { TeacherWorkspace } from '../src/teacher/TeacherWorkspace';
import { displayDate } from '../src/teacher/model';
import { exerciseMode, learningState, studentError } from '../src/ui-vi';
import {
  UI_LANGUAGE,
  UI_LOCALE,
  displayNumber,
  displayPercent,
  localizeValidation,
} from '../src/ui-vi';
import { LessonReader } from '../src/lesson-preview/LessonReader';
import { App } from '../src/App';

describe('VI-01 canonical Vietnamese presentation', () => {
  it('keeps the deployment override strictly Web-image only', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const yaml = require('js-yaml');
    const config = yaml.load(
      fs.readFileSync(
        path.resolve(__dirname, '../../../deploy/vi01/web-only.override.yaml'),
        'utf8',
      ),
    );
    expect(Object.keys(config.services)).toEqual(['web']);
    expect(Object.keys(config.services.web)).toEqual(['image']);
    expect(config.services.web.image).toBe(
      '${VI01_WEB_IMAGE:?Explicit reviewed Web image required}',
    );
  });
  it('keeps Vietnamese UI and VI lesson default with an English browser', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { language: 'en-US', languages: ['en-US'] },
    });
    try {
      expect(UI_LANGUAGE).toBe('vi');
      expect(UI_LOCALE).toBe('vi-VN');
      expect(renderToStaticMarkup(<App />)).toContain('Đang tải…');
      const reader = renderToStaticMarkup(<LessonReader onBack={() => {}} />);
      expect(reader).toContain('value="vi" selected=""');
      expect(reader).toContain('Ngôn ngữ hướng dẫn trong bài');
      expect(reader).toContain('Tiếng Anh (nội dung bài học)');
      expect(reader).not.toMatch(/Back to Today|English|Loading lesson|Your answer/);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
      else Reflect.deleteProperty(globalThis, 'navigator');
    }
  });
  it('uses Vietnamese number and percentage formatting', () => {
    expect(displayNumber(12345)).toBe('12.345');
    expect(displayPercent(0.875)).toBe(
      new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 0 }).format(0.875),
    );
  });
  it('localizes native validation without weakening constraints', () => {
    let text = '';
    const input = {
      validity: { valid: false, valueMissing: true },
      setCustomValidity: (s: string) => {
        text = s;
      },
    };
    localizeValidation(input as unknown as HTMLInputElement);
    expect(text).toBe('Vui lòng điền thông tin này.');
    input.validity = { valid: true, valueMissing: false };
    localizeValidation(input as unknown as HTMLInputElement);
    expect(text).toBe('');
  });
  it('renders Vietnamese login and accessible labels without changing form field names', () => {
    const html = renderToStaticMarkup(<LoginScreen onAuthenticated={() => {}} />);
    expect(html).toContain('Đăng nhập');
    expect(html).toContain('Tên đăng nhập');
    expect(html).toContain('Mật khẩu');
    expect(html).toContain('name="login"');
    expect(html).toContain('autoComplete="current-password"');
  });
  it('preserves Chinese answers and verdict semantics', () => {
    const result: ResultView = {
      sessionId: 'private-id',
      correct: true,
      feedback: 'Correct',
      expected: '你好',
      received: '你好',
      submittedAt: '2026-10-23T00:00:00Z',
      integrityStatus: 'COMPLETE',
      next: { action: 'NEXT', remaining: 2, completedToday: 1 },
    };
    const html = renderToStaticMarkup(
      <ResultScreen
        result={result}
        onNext={() => {}}
        onToday={() => {}}
        nextBusy={false}
        nextError={null}
      />,
    );
    expect(html).toContain('✓ Chính xác');
    expect(html).toContain('你好');
    expect(html).toContain('lang="zh-Hans"');
    expect(html).toContain('Bài tập tiếp theo');
    expect(html).not.toContain('private-id');
    expect(
      renderToStaticMarkup(
        <ResultScreen
          result={{ ...result, correct: false }}
          onNext={() => {}}
          onToday={() => {}}
          nextBusy={true}
          nextError={null}
        />,
      ),
    ).toContain('✗ Chưa chính xác');
  });
  it('localizes class form labels without changing validation', () => {
    const html = renderToStaticMarkup(
      <CreateClassForm
        onExpired={() => {}}
        onSaved={() => {}}
        onCancel={() => {}}
        onBusyChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Tạo lớp"');
    expect(html).toContain('Tên lớp');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('Hủy');
  });
  it('keeps the teacher role boundary and localizes its denial', () => {
    const html = renderToStaticMarkup(
      <TeacherWorkspace
        principal={{
          publicId: 'id',
          login: 'synthetic',
          displayName: null,
          roles: ['STUDENT'],
        }}
        onExpired={() => {}}
        onBusyChange={() => {}}
      />,
    );
    expect(html).toContain('không có quyền truy cập giao diện giáo viên');
    expect(html).not.toContain('Không gian giảng dạy');
  });
  it.each([400, 401, 403, 404, 409, 410, 422, 429, 500])(
    'hides raw API messages for %s',
    (status) => {
      expect(
        studentError(new ApiError(status, 'UNKNOWN', 'private internal detail'), 'Không thể tải.'),
      ).not.toContain('private internal detail');
    },
  );
  it('localizes CSRF and network errors', () => {
    expect(studentError(new ApiError(403, 'AUTH_CSRF_INVALID', 'raw'), 'Lỗi')).toContain('bảo mật');
    expect(studentError(new Error('network'), 'Mất kết nối')).toBe('Mất kết nối');
  });
  it('maps known enums for display without exposing unknown values', () => {
    expect(['NEW', 'LEARNING', 'FAMILIAR', 'MASTERED'].map(learningState)).toEqual([
      'Mới',
      'Đang học',
      'Đã quen',
      'Đã nắm vững',
    ]);
    expect(exerciseMode('ZH_TO_VI')).toBe('Tiếng Trung → Tiếng Việt');
    expect(exerciseMode('unknown')).toBe('Luyện tập');
    expect(learningState('unknown')).toBe('Chưa xác định');
  });
  it('formats dates using Vietnamese and preserves the browser timezone', () => {
    const value = '2026-10-23T10:30:00Z';
    expect(displayDate(value)).toBe(
      new Date(value).toLocaleString('vi-VN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    expect(displayDate(null)).toBe('Không có hạn');
    expect(displayDate('invalid')).toBe('Không có thông tin ngày');
  });
});
