/**
 * Teacher MVP typed errors (CP-06).
 *
 * Every failure on the teacher surface carries a stable machine code and a
 * SAFE message. Object-level authorization failures are deliberately
 * INDISTINGUISHABLE from "does not exist": a teacher probing another
 * teacher's class/student/note gets the same `TEACHER_NOT_FOUND` as one
 * probing a random id, so nothing about the existence of foreign objects leaks.
 *
 * An authenticated caller without the TEACHER/ADMIN role never reaches the
 * service (RoleGuard answers 403 first with the shared auth body).
 */
export const TEACHER_ERROR_CODES = {
  /** A class/student/note/assignment is missing OR not visible to the caller. */
  NOT_FOUND: 'TEACHER_NOT_FOUND',
  /** The request body/query is malformed, too long, or out of policy. */
  INVALID_INPUT: 'TEACHER_INVALID_INPUT',
  /** The enrollment already exists (class + student uniqueness). */
  ALREADY_ENROLLED: 'TEACHER_ALREADY_ENROLLED',
  /** The assignment already exists (class + student + lesson uniqueness). */
  ASSIGNMENT_EXISTS: 'TEACHER_ASSIGNMENT_EXISTS',
  /** The referenced lesson is not PUBLISHED and cannot be assigned. */
  LESSON_NOT_ASSIGNABLE: 'TEACHER_LESSON_NOT_ASSIGNABLE',
  /** The student account is not an ACTIVE user (cannot be enrolled). */
  STUDENT_NOT_ENROLLABLE: 'TEACHER_STUDENT_NOT_ENROLLABLE',
  /** A concurrent write lost the race on a uniqueness constraint. */
  CONFLICT: 'TEACHER_CONFLICT',
} as const;

export type TeacherErrorCode = (typeof TEACHER_ERROR_CODES)[keyof typeof TEACHER_ERROR_CODES];

/** Base class for CP-06 teacher-surface failures (carries an HTTP-clean code). */
export class TeacherError extends Error {
  constructor(
    readonly code: TeacherErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TeacherError';
  }
}

/** Object missing or not owned/visible to the caller (no existence disclosure). */
export class TeacherNotFoundError extends TeacherError {
  constructor(message = 'Not found') {
    super(TEACHER_ERROR_CODES.NOT_FOUND, message);
    this.name = 'TeacherNotFoundError';
  }
}

/** Malformed or out-of-policy input (bounded text, bad ids, bad windows). */
export class TeacherInvalidInputError extends TeacherError {
  constructor(message = 'Invalid request') {
    super(TEACHER_ERROR_CODES.INVALID_INPUT, message);
    this.name = 'TeacherInvalidInputError';
  }
}

/** The student is already enrolled in this class. */
export class TeacherAlreadyEnrolledError extends TeacherError {
  constructor(message = 'Student is already enrolled in this class') {
    super(TEACHER_ERROR_CODES.ALREADY_ENROLLED, message);
    this.name = 'TeacherAlreadyEnrolledError';
  }
}

/** The assignment already exists for this class + student + lesson. */
export class TeacherAssignmentExistsError extends TeacherError {
  constructor(message = 'This lesson is already assigned to the student') {
    super(TEACHER_ERROR_CODES.ASSIGNMENT_EXISTS, message);
    this.name = 'TeacherAssignmentExistsError';
  }
}

/** The lesson is not published (CP-01 visibility gate) and may not be assigned. */
export class TeacherLessonNotAssignableError extends TeacherError {
  constructor(message = 'Only published lessons can be assigned') {
    super(TEACHER_ERROR_CODES.LESSON_NOT_ASSIGNABLE, message);
    this.name = 'TeacherLessonNotAssignableError';
  }
}

/** The target account is not an active user and cannot be enrolled. */
export class TeacherStudentNotEnrollableError extends TeacherError {
  constructor(message = 'This account cannot be enrolled') {
    super(TEACHER_ERROR_CODES.STUDENT_NOT_ENROLLABLE, message);
    this.name = 'TeacherStudentNotEnrollableError';
  }
}

/** A uniqueness/foreign-key race at the storage layer. */
export class TeacherConflictError extends TeacherError {
  constructor(message = 'The request conflicts with an existing record') {
    super(TEACHER_ERROR_CODES.CONFLICT, message);
    this.name = 'TeacherConflictError';
  }
}
