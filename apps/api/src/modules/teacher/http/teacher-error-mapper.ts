/**
 * CP-06 error -> ADR-005 HTTP body mapping.
 *
 * Every teacher error maps to the SAME response envelope used across the API:
 *   { error: { code, message, requestId? } }
 * Messages are static/safe: no ORM text, no surrogate ids, no existence leak.
 */
import { TeacherError, TEACHER_ERROR_CODES } from '../domain/teacher-errors';

export interface TeacherHttpErrorBody {
  error: { code: string; message: string; requestId?: string };
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [TEACHER_ERROR_CODES.NOT_FOUND]: 404,
  [TEACHER_ERROR_CODES.INVALID_INPUT]: 400,
  [TEACHER_ERROR_CODES.ALREADY_ENROLLED]: 409,
  [TEACHER_ERROR_CODES.ASSIGNMENT_EXISTS]: 409,
  [TEACHER_ERROR_CODES.LESSON_NOT_ASSIGNABLE]: 422,
  [TEACHER_ERROR_CODES.STUDENT_NOT_ENROLLABLE]: 422,
  [TEACHER_ERROR_CODES.CONFLICT]: 409,
};

const SAFE_MESSAGE: Readonly<Record<string, string>> = {
  [TEACHER_ERROR_CODES.NOT_FOUND]: 'Not found',
  [TEACHER_ERROR_CODES.INVALID_INPUT]: 'Invalid request',
  [TEACHER_ERROR_CODES.ALREADY_ENROLLED]: 'Student is already enrolled in this class',
  [TEACHER_ERROR_CODES.ASSIGNMENT_EXISTS]: 'This lesson is already assigned to the student',
  [TEACHER_ERROR_CODES.LESSON_NOT_ASSIGNABLE]: 'Only published lessons can be assigned',
  [TEACHER_ERROR_CODES.STUDENT_NOT_ENROLLABLE]: 'This account cannot be enrolled',
  [TEACHER_ERROR_CODES.CONFLICT]: 'The request conflicts with an existing record',
};

export function mapTeacherError(
  error: unknown,
  requestId?: string,
): { status: number; body: TeacherHttpErrorBody } | null {
  if (!(error instanceof TeacherError)) return null;
  const status = STATUS_BY_CODE[error.code] ?? 500;
  return {
    status,
    body: {
      error: {
        code: error.code,
        message: SAFE_MESSAGE[error.code] ?? 'Request failed',
        ...(requestId ? { requestId } : {}),
      },
    },
  };
}
