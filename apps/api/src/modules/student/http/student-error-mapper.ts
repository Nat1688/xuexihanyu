/**
 * Student HTTP error mapping (CP-05; ADR-005).
 *
 * Maps CP-05 student errors to the shared ADR-005 error contract — stable code,
 * safe message, HTTP status, optional correlation id. It never exposes stack
 * traces, SQL/ORM text, another learner's data or the answer key.
 *
 *   - NO_CONTENT       → 200 with an empty-state payload (handled by controller)
 *     ...but when raised as an exception it becomes 404 NO_CONTENT so a client
 *     can distinguish "nothing to do" from a server fault.
 *   - FORBIDDEN        → 403
 *   - SESSION_NOT_FOUND → 404
 *   - SESSION_EXPIRED  → 410 (Gone: the resource existed and is now unusable)
 *   - ALREADY_ANSWERED → 409
 *   - INVALID_ANSWER / INVALID_TOKEN → 400
 *   - CONFLICT         → 409
 */
import { STUDENT_ERROR_CODES, StudentError } from '../domain/student-errors';

/** The stable error body shape (ADR-005). */
export interface StudentErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId?: string;
  };
}

export interface MappedStudentError {
  readonly status: number;
  readonly body: StudentErrorBody;
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [STUDENT_ERROR_CODES.NO_CONTENT]: 404,
  [STUDENT_ERROR_CODES.FORBIDDEN]: 403,
  [STUDENT_ERROR_CODES.SESSION_NOT_FOUND]: 404,
  [STUDENT_ERROR_CODES.SESSION_EXPIRED]: 410,
  [STUDENT_ERROR_CODES.ALREADY_ANSWERED]: 409,
  [STUDENT_ERROR_CODES.INVALID_ANSWER]: 400,
  [STUDENT_ERROR_CODES.INVALID_TOKEN]: 400,
  [STUDENT_ERROR_CODES.CONFLICT]: 409,
};

/** Map a CP-05 student error; `null` for anything this mapper does not own. */
export function mapStudentError(error: unknown, requestId?: string): MappedStudentError | null {
  if (!(error instanceof StudentError)) return null;
  const status = STATUS_BY_CODE[error.code] ?? 500;
  const message = status === 500 ? 'Internal server error.' : error.message;
  return {
    status,
    body: {
      error: requestId ? { code: error.code, message, requestId } : { code: error.code, message },
    },
  };
}
