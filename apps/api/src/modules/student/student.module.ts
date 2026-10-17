/**
 * Student module (CP-05).
 *
 * Wiring for the LOGIN -> TODAY -> CONTINUE -> EXERCISE -> RESULT -> NEXT slice.
 *
 * Layer map:
 *   - `domain/`          pure rules (ordering, answerability, NEXT routing,
 *                        token validation, item selection) — no I/O.
 *   - `application/`     `StudentService` composing CP-01 published content,
 *                        CP-02 exercise generation/evaluation, CP-03 evidence
 *                        and CP-04 projections behind narrow ports.
 *   - `infrastructure/`  Prisma adapters for the two CP-05 tables + read views.
 *   - `http/`            `StudentController` (STUDENT-only), ADR-005 filter.
 *
 * CP-05 COMPOSES the existing modules; it does not re-wire or duplicate them:
 *   `IdentityModule` (auth + role guards), `ExerciseModule` (generate/evaluate),
 *   `LearningEventsModule` (append evidence) and `MasteryModule` (derive). The
 *   `PrismaModule` is global but is imported explicitly for readability.
 *
 * Ownership of writes: CP-05 writes ONLY its two linkage tables
 * (`exercise_sessions`, `answer_submissions`). Content (CP-01), evidence
 * (CP-03) and mastery projections (CP-04) keep their existing owners.
 *
 * Forbidden here (contract): teacher/class/assignment modules, analytics
 * dashboards, AI generation/hints, notifications and social features.
 */
import { Module } from '@nestjs/common';

import { ExerciseModule } from '../exercise/exercise.module';
import { PrismaModule } from '../foundation/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { LearningEventsModule } from '../learning-events/learning-events.module';
import { MasteryModule } from '../mastery/mastery.module';
import { ExerciseService } from '../exercise/application/exercise-service';
import { LearningEventService } from '../learning-events/application/learning-event-service';
import { MasteryService } from '../mastery/application/mastery-service';
import { StudentService } from './application/student-service';
import {
  type AnswerSessionRepository,
  type StudentContentReader,
  type StudentProgressReader,
} from './application/student-ports';
import { PrismaAnswerSessionRepository } from './infrastructure/prisma-answer-session.repository';
import { PrismaStudentContentReader } from './infrastructure/prisma-student-content.reader';
import { PrismaStudentProgressReader } from './infrastructure/prisma-student-progress.reader';
import { StudentController } from './http/student.controller';
import {
  STUDENT_CONTENT_READER,
  STUDENT_PROGRESS_READER,
  STUDENT_SESSION_REPOSITORY,
} from './student.tokens';

@Module({
  imports: [PrismaModule, IdentityModule, ExerciseModule, LearningEventsModule, MasteryModule],
  controllers: [StudentController],
  providers: [
    PrismaStudentContentReader,
    PrismaStudentProgressReader,
    PrismaAnswerSessionRepository,
    { provide: STUDENT_CONTENT_READER, useExisting: PrismaStudentContentReader },
    { provide: STUDENT_PROGRESS_READER, useExisting: PrismaStudentProgressReader },
    { provide: STUDENT_SESSION_REPOSITORY, useExisting: PrismaAnswerSessionRepository },
    {
      provide: StudentService,
      inject: [
        STUDENT_CONTENT_READER,
        STUDENT_PROGRESS_READER,
        STUDENT_SESSION_REPOSITORY,
        ExerciseService,
        LearningEventService,
        MasteryService,
      ],
      useFactory: (
        content: StudentContentReader,
        progress: StudentProgressReader,
        sessions: AnswerSessionRepository,
        exercises: ExerciseService,
        events: LearningEventService,
        mastery: MasteryService,
      ) => new StudentService({ content, progress, sessions, exercises, events, mastery }),
    },
  ],
  exports: [StudentService],
})
export class StudentModule {}
