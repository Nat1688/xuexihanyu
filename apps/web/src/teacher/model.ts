import { ApiError, type Principal } from '../api/client';

// Navigation hints only; the server independently enforces permissions.
export const canTeach = (principal: Principal) =>
  principal.roles.some((role) => role === 'TEACHER' || role === 'ADMIN');
export const canStudy = (principal: Principal) => principal.roles.includes('STUDENT');

export function teacherError(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Connection interrupted. Refresh to check the latest data before trying again.';
  if (error.status === 401) return 'Your session has expired. Please sign in again.';
  if (error.code === 'AUTH_CSRF_INVALID')
    return 'Security check failed. Reload this page and try again.';
  if (error.status === 403) return 'You do not have permission to view or change this data.';
  if (error.status === 404) return 'This resource is unavailable or you no longer have access.';
  if (error.status === 409)
    return 'This record already exists or conflicts with another change. Refresh to check it.';
  if (error.status === 422)
    return 'This lesson or account is no longer eligible. Refresh and choose again.';
  if (error.status === 400) return 'Check the form fields and try again.';
  return 'Unable to complete this request. Please try again later.';
}

export function displayDate(value: string | null): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
