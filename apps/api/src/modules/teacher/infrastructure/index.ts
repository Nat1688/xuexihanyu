/**
 * CP-06 infrastructure barrel — one Prisma adapter per teacher port.
 */
export { PrismaTeacherClassRepository } from './teacher-class.repository';
export { PrismaTeacherEnrollmentRepository } from './teacher-enrollment.repository';
export { PrismaTeacherAssignmentRepository } from './teacher-assignment.repository';
export { PrismaTeacherEvidenceReader } from './teacher-evidence.reader';
export { PrismaTeacherNoteRepository } from './teacher-note.repository';
