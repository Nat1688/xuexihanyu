import { ApiError, type Principal } from '../api/client';
import { UI_LOCALE } from '../ui-vi';

// Navigation hints only; the server independently enforces permissions.
export const canTeach = (principal: Principal) =>
  principal.roles.some((role) => role === 'TEACHER' || role === 'ADMIN');
export const canStudy = (principal: Principal) => principal.roles.includes('STUDENT');

export function teacherError(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Kết nối bị gián đoạn. Hãy tải lại để kiểm tra dữ liệu mới nhất trước khi thử lại.';
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.code === 'AUTH_CSRF_INVALID')
    return 'Kiểm tra bảo mật không thành công. Hãy tải lại trang rồi thử lại.';
  if (error.status === 403) return 'Bạn không có quyền xem hoặc thay đổi dữ liệu này.';
  if (error.status === 404)
    return 'Nội dung này không còn khả dụng hoặc bạn không còn quyền truy cập.';
  if (error.status === 409)
    return 'Bản ghi đã tồn tại hoặc xung đột với thay đổi khác. Hãy tải lại để kiểm tra.';
  if (error.status === 422)
    return 'Bài học hoặc tài khoản này không còn đủ điều kiện. Hãy tải lại và chọn lại.';
  if (error.status === 400) return 'Hãy kiểm tra các trường thông tin rồi thử lại.';
  return 'Không thể hoàn thành yêu cầu. Vui lòng thử lại sau.';
}

export function displayDate(value: string | null): string {
  if (!value) return 'Không có hạn';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Không có thông tin ngày'
    : date.toLocaleString(UI_LOCALE, {
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}
