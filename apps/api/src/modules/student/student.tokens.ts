/**
 * DI tokens for the student module (CP-05).
 *
 * Ports are bound by token so infrastructure adapters can be swapped (e.g. a
 * deterministic fake in tests) without the application service knowing which
 * database implementation is in play.
 */
export const STUDENT_CONTENT_READER = Symbol('STUDENT_CONTENT_READER');
export const STUDENT_PROGRESS_READER = Symbol('STUDENT_PROGRESS_READER');
export const STUDENT_SESSION_REPOSITORY = Symbol('STUDENT_SESSION_REPOSITORY');
