import { Module } from '@nestjs/common';

import { ExerciseService } from './application/exercise-service';
import { EXERCISE_CONTENT_READER } from './application/tokens';
import { PrismaExerciseContentReader } from './infrastructure/prisma-exercise-content.reader';

/**
 * Exercise boundary (CP-02).
 *
 * Provider-neutral, deterministic exercise generation + evaluation over
 * APPROVED content:
 *   - `domain/`          exercise mode/format vocabulary (content-derived modes;
 *                        audio declared as a contract placeholder only),
 *                        deterministic field normalization, deterministic
 *                        distractor selection, the content-referenced
 *                        definition/instance contract and pure evaluation.
 *   - `application/`      `ExerciseContentReader` port, `ExerciseService`
 *                        use-cases, DI tokens.
 *   - `infrastructure/`   Prisma-backed read-only reader over approved content.
 *
 * The service reads approved content through the narrow port and STORES NOTHING.
 * There is intentionally NO controller and NO UI in CP-02.
 *
 * DELIBERATELY ABSENT (CP-02 forbidden): learning-event/attempt capture (CP-03),
 * mastery/review scheduling (CP-04), AI generation/orchestration, media storage/
 * delivery, persisted exercise sessions and any UI.
 */
@Module({
  providers: [
    { provide: EXERCISE_CONTENT_READER, useClass: PrismaExerciseContentReader },
    {
      provide: ExerciseService,
      useFactory: (content: PrismaExerciseContentReader) => new ExerciseService({ content }),
      inject: [EXERCISE_CONTENT_READER],
    },
  ],
  exports: [ExerciseService],
})
export class ExerciseModule {}
