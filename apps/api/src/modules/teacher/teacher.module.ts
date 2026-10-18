/**
 * Teacher module (CP-06).
 *
 * Wiring for the teacher MVP slice:
 *   classes -> enrollments -> assignments -> evidence-backed progress ->
 *   weak items -> private notes
 *
 * Layer map:
 *   - `domain/`          pure rules: object-level authorization, input bounds,
 *                        deterministic weak-item ranking.
 *   - `application/`     `TeacherService` composing the narrow ports.
 *   - `infrastructure/`  Prisma adapters for CP-06 tables + CP-03/CP-04 reads.
 *   - `http/`            `TeacherController` (TEACHER/ADMIN), ADR-005 filter.
 *
 * This module COMPOSES the existing modules and does not re-wire them:
 * `IdentityModule` (auth + role guards) and the global `PrismaModule`. It
 * WRITES only its four tables (`teaching_classes`, `class_enrollments`,
 * `lesson_assignments`, `teacher_notes`) and only READS content (CP-01),
 * evidence (CP-03) and projections (CP-04).
 *
 * Forbidden here (contract): AI generation/summaries, high-stakes grading,
 * notifications, analytics dashboards, global student search, social features.
 */
import { Module } from '@nestjs/common';

import { PrismaModule } from '../foundation/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { TeacherService } from './application/teacher-service';
import {
  type AssignmentRepository,
  type ClassRepository,
  type EnrollmentRepository,
  type EvidenceRepository,
  type NoteRepository,
} from './application/teacher-ports';
import {
  PrismaTeacherAssignmentRepository,
  PrismaTeacherClassRepository,
  PrismaTeacherEnrollmentRepository,
  PrismaTeacherEvidenceReader,
  PrismaTeacherNoteRepository,
} from './infrastructure';
import { TeacherController } from './http/teacher.controller';
import {
  TEACHER_ASSIGNMENT_REPOSITORY,
  TEACHER_CLASS_REPOSITORY,
  TEACHER_ENROLLMENT_REPOSITORY,
  TEACHER_EVIDENCE_REPOSITORY,
  TEACHER_NOTE_REPOSITORY,
} from './teacher.tokens';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [TeacherController],
  providers: [
    PrismaTeacherClassRepository,
    PrismaTeacherEnrollmentRepository,
    PrismaTeacherAssignmentRepository,
    PrismaTeacherEvidenceReader,
    PrismaTeacherNoteRepository,
    { provide: TEACHER_CLASS_REPOSITORY, useExisting: PrismaTeacherClassRepository },
    { provide: TEACHER_ENROLLMENT_REPOSITORY, useExisting: PrismaTeacherEnrollmentRepository },
    { provide: TEACHER_ASSIGNMENT_REPOSITORY, useExisting: PrismaTeacherAssignmentRepository },
    { provide: TEACHER_EVIDENCE_REPOSITORY, useExisting: PrismaTeacherEvidenceReader },
    { provide: TEACHER_NOTE_REPOSITORY, useExisting: PrismaTeacherNoteRepository },
    {
      provide: TeacherService,
      inject: [
        TEACHER_CLASS_REPOSITORY,
        TEACHER_ENROLLMENT_REPOSITORY,
        TEACHER_ASSIGNMENT_REPOSITORY,
        TEACHER_EVIDENCE_REPOSITORY,
        TEACHER_NOTE_REPOSITORY,
      ],
      useFactory: (
        classes: ClassRepository,
        enrollments: EnrollmentRepository,
        assignments: AssignmentRepository,
        evidence: EvidenceRepository,
        notes: NoteRepository,
      ) => new TeacherService({ classes, enrollments, assignments, evidence, notes }),
    },
  ],
  exports: [TeacherService],
})
export class TeacherModule {}
