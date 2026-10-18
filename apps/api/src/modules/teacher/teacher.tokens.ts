/**
 * DI tokens for the teacher module (CP-06).
 *
 * Ports are injected by token so the Prisma adapters can be swapped for a
 * deterministic in-memory fake in unit tests without the service knowing.
 */
export const TEACHER_CLASS_REPOSITORY = Symbol('TEACHER_CLASS_REPOSITORY');
export const TEACHER_ENROLLMENT_REPOSITORY = Symbol('TEACHER_ENROLLMENT_REPOSITORY');
export const TEACHER_ASSIGNMENT_REPOSITORY = Symbol('TEACHER_ASSIGNMENT_REPOSITORY');
export const TEACHER_EVIDENCE_REPOSITORY = Symbol('TEACHER_EVIDENCE_REPOSITORY');
export const TEACHER_NOTE_REPOSITORY = Symbol('TEACHER_NOTE_REPOSITORY');
