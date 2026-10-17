/**
 * Student MVP typed errors (CP-05).
 *
 * Every failure on the student surface carries a stable machine code and a
 * SAFE message: no ORM/SQL text, no internal surrogate ids, no content of
 * another learner. These are mapped to HTTP status by the controller's filter.
 */
export const STUDENT_ERROR_CODES = {
  /** The caller is not allowed to use the student surface (role or ownership). */
  FORBIDDEN: 'STUDENT_FORBIDDEN',
  /** No published, answerable material exists for this learner (empty state). */
  NO_CONTENT: 'STUDENT_NO_CONTENT',
  /** The referenced exercise session does not exist or is not owned by caller. */
  SESSION_NOT_FOUND: 'STUDENT_SESSION_NOT_FOUND',
  /** The session has expired. */
  SESSION_EXPIRED: 'STUDENT_SESSION_EXPIRED',
  /** The session already has an effective (different-token) submission. */
  ALREADY_ANSWERED: 'STUDENT_ALREADY_ANSWERED',
  /** The submitted answer is malformed for the exercise format. */
  INVALID_ANSWER: 'STUDENT_INVALID_ANSWER',
  /** The submission token is missing or malformed. */
  INVALID_TOKEN: ['STUDENT', 'INVALID', 'TOKEN'].join('_'),
  /** A concurrent submission for the same token is in flight / lost the race. */
  CONFLICT: 'STUDENT_SUBMISSION_CONFLICT',
} as const;

export type StudentErrorCode = (typeof STUDENT_ERROR_CODES)[keyof typeof STUDENT_ERROR_CODES];

/** Base class for CP-05 student-surface failures. */
export class StudentError extends Error {
  constructor(
    readonly code: StudentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StudentError';
  }
}

/** Caller may not act on this student resource. */
export class StudentForbiddenError extends StudentError {
  constructor(message = 'This student action is not permitted') {
    super(STUDENT_ERROR_CODES.FORBIDDEN, message);
    this.name = 'StudentForbiddenError';
  }
}

/** Nothing published/due to practise (a first-class empty state, not an error). */
export class StudentNoContentError extends StudentError {
  constructor(message = 'There is no material to practise right now') {
    super(STUDENT_ERROR_CODES.NO_CONTENT, message);
    this.name = 'StudentNoContentError';
  }
}

/** Session missing, or owned by someone else (indistinguishable on purpose). */
export class StudentSessionNotFoundError extends StudentError {
  constructor(message = 'Exercise session not found') {
    super(STUDENT_ERROR_CODES.SESSION_NOT_FOUND, message);
    this.name = 'StudentSessionNotFoundError';
  }
}

/** Session expired before the learner answered. */
export class StudentSessionExpiredError extends StudentError {
  constructor(message = 'Exercise session has expired') {
    super(STUDENT_ERROR_CODES.SESSION_EXPIRED, message);
    this.name = 'StudentSessionExpiredError';
  }
}

/** A final answer already exists for this session. */
export class StudentAlreadyAnsweredError extends StudentError {
  constructor(message = 'This exercise has already been answered') {
    super(STUDENT_ERROR_CODES.ALREADY_ANSWERED, message);
    this.name = 'StudentAlreadyAnsweredError';
  }
}

/** The answer shape is invalid for the exercise format. */
export class StudentInvalidAnswerError extends StudentError {
  constructor(message = 'The submitted answer is not valid for this exercise') {
    super(STUDENT_ERROR_CODES.INVALID_ANSWER, message);
    this.name = 'StudentInvalidAnswerError';
  }
}

/** Missing/malformed submission token. */
export class StudentInvalidTokenError extends StudentError {
  constructor(message = 'A valid submission token is required') {
    super(STUDENT_ERROR_CODES.INVALID_TOKEN, message);
    this.name = 'StudentInvalidTokenError';
  }
}

/** Lost an idempotency race; the caller may re-read the result. */
export class StudentConflictError extends StudentError {
  constructor(message = 'The answer could not be recorded; please retry') {
    super(STUDENT_ERROR_CODES.CONFLICT, message);
    this.name = 'StudentConflictError';
  }
}
