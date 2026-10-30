jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
import { currentApplication, type Application } from '../src/admissions/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginScreen } from '../src/screens/LoginScreen';
function row(publicId: string, status: Application['status'], createdAt: string): Application {
  return {
    publicId,
    status,
    createdAt,
    decidedAt: null,
    reason: null,
    course: { publicId: 'course', title: 'Khóa' },
    student: { publicId: 'student', login: 'synthetic@example.invalid' },
    class: null,
  };
}
describe('ENROLL-01 status display', () => {
  it('shows latest cancelled request rather than an older rejection regardless of enum order', () => {
    const rejected = row('old', 'REJECTED', '2026-10-01T00:00:00Z');
    const cancelled = row('new', 'CANCELLED', '2026-10-02T00:00:00Z');
    expect(currentApplication([rejected, cancelled], 'course')).toBe(cancelled);
  });
  it('keeps the live approved/pending request distinct from terminal history', () => {
    const pending = row('live', 'PENDING', '2026-10-02T00:00:00Z');
    expect(
      currentApplication([row('old', 'REJECTED', '2026-10-01T00:00:00Z'), pending], 'course'),
    ).toBe(pending);
    expect(currentApplication([pending], 'other')).toBeUndefined();
  });
  it('exposes self registration in Vietnamese at login', () => {
    expect(renderToStaticMarkup(<LoginScreen onAuthenticated={() => {}} />)).toContain(
      'Đăng ký học sinh',
    );
  });
});
