import { ApiError } from './api/client';

// Canonical release UI. Instruction-language content remains a separate contract.
// No navigator language detection, runtime locale switch or English fallback.
export const UI_LANGUAGE = 'vi' as const;
export const UI_LOCALE = 'vi-VN';
export const ui = {
  app: { title: 'XueXiHanyu — Học tiếng Trung', skip: 'Chuyển đến nội dung chính' },
  common: { loading: 'Đang tải…', retry: 'Thử lại', logout: 'Đăng xuất' },
  login: {
    title: 'Đăng nhập',
    login: 'Tên đăng nhập',
    passwordLabel: 'Mật khẩu',
    busy: 'Đang đăng nhập…',
  },
  preview: {
    title: 'Bài 01 · BẢN XEM TRƯỚC',
    language: 'Ngôn ngữ hướng dẫn trong bài',
    vi: 'Tiếng Việt',
    en: 'Tiếng Anh (nội dung bài học)',
    back: 'Về Hôm nay',
    notice: 'Chờ giáo viên chuyên môn duyệt. Tự luyện — chưa lưu tiến độ.',
    reload: 'Tải lại trang sẽ xóa trạng thái tự luyện chưa lưu. Nghe/nói cần giáo viên quan sát.',
    revision: 'Phiên bản',
    unavailable:
      'Bài xem trước hoặc phiên bản này không khả dụng. Hãy tải lại bài hoặc về Hôm nay.',
  },
  validation: {
    required: 'Vui lòng điền thông tin này.',
    invalid: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
    range: 'Giá trị nằm ngoài khoảng cho phép.',
    pattern: 'Vui lòng nhập đúng định dạng được yêu cầu.',
  },
};
export const displayNumber = (value: number) => new Intl.NumberFormat(UI_LOCALE).format(value);
export const displayPercent = (value: number) =>
  new Intl.NumberFormat(UI_LOCALE, { style: 'percent', maximumFractionDigits: 0 }).format(value);
export function localizeValidation(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  element.setCustomValidity('');
  const validity = element.validity;
  if (validity.valid) return;
  element.setCustomValidity(
    validity.valueMissing
      ? ui.validation.required
      : validity.rangeOverflow || validity.rangeUnderflow
        ? ui.validation.range
        : validity.patternMismatch
          ? ui.validation.pattern
          : ui.validation.invalid,
  );
}
export function initializeVietnameseUi() {
  document.documentElement.lang = UI_LANGUAGE;
  document.title = ui.app.title;
  document.addEventListener(
    'invalid',
    (event) => {
      const element = event.target;
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
        localizeValidation(element);
    },
    true,
  );
  document.addEventListener('input', (event) => {
    const element = event.target;
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    )
      element.setCustomValidity('');
  });
}

// Presentation only: never translate wire values or lesson/user-authored content.
export function learningState(value: string): string {
  const labels: Record<string, string> = {
    NEW: 'Mới',
    LEARNING: 'Đang học',
    FAMILIAR: 'Đã quen',
    MASTERED: 'Đã nắm vững',
  };
  return labels[value] ?? 'Chưa xác định';
}

export function exerciseMode(value: string): string {
  const labels: Record<string, string> = {
    ZH_TO_VI: 'Tiếng Trung → Tiếng Việt',
    VI_TO_ZH: 'Tiếng Việt → Tiếng Trung',
    ZH_TO_PINYIN: 'Tiếng Trung → Pinyin',
    PINYIN_TO_ZH: 'Pinyin → Tiếng Trung',
  };
  return labels[value] ?? 'Luyện tập';
}

export function studentError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'AUTH_CSRF_INVALID')
    return 'Kiểm tra bảo mật không thành công. Hãy tải lại trang rồi thử lại.';
  if (error.status === 401)
    return 'Không thể xác thực. Hãy kiểm tra tài khoản, mật khẩu hoặc đăng nhập lại.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.status === 404) return 'Không tìm thấy nội dung hoặc bạn không có quyền truy cập.';
  if (error.status === 409) return 'Yêu cầu xung đột với dữ liệu đã lưu. Hãy tải lại để kiểm tra.';
  if (error.status === 410) return 'Phiên bài tập đã hết hạn. Hãy mở bài tập khác.';
  if (error.status === 429) return 'Bạn thao tác quá nhanh. Vui lòng chờ một lát rồi thử lại.';
  if (error.status === 400 || error.status === 422)
    return 'Hãy kiểm tra thông tin đã nhập rồi thử lại.';
  return fallback;
}
