import { Module } from '@nestjs/common';

import { LEARNING_EVENT_REPOSITORY } from './application/tokens';
import { LearningEventService } from './application/learning-event-service';
import { PrismaLearningEventRepository } from './infrastructure/prisma-learning-event.repository';

/**
 * Learning-events boundary (CP-03).
 *
 * The append-only, versioned interaction-evidence foundation:
 *   - `domain/`         the closed event-type vocabulary, the payload
 *                       schema-version policy, the bounded allow-listed
 *                       metadata contract, deterministic ordering, the
 *                       validated event record contract and typed safe errors.
 *   - `application/`     the APPEND-ONLY `LearningEventRepository` port,
 *                       `LearningEventService` (record + bounded read), DI
 *                       tokens.
 *   - `infrastructure/`  the Prisma-backed, append-only event store over the
 *                       CP-03 `learning_events` table.
 *
 * There is NO HTTP controller: the task contract forbids a mutable event
 * endpoint and defers teacher/admin read access to a separately approved
 * reporting/query contract. The service is exported so a future approved
 * boundary can record events.
 *
 * `PrismaModule` is global, so `PrismaService` is injectable here without an
 * explicit import.
 *
 * DELIBERATELY ABSENT (CP-03 forbidden): any update/delete/mutable event
 * path, mastery/review scheduling or progress projection (CP-04), Student MVP
 * UI flow, analytics dashboard, AI generation, event broker/microservice, and
 * any raw answer/secret/session payload.
 */
@Module({
  providers: [
    { provide: LEARNING_EVENT_REPOSITORY, useClass: PrismaLearningEventRepository },
    {
      provide: LearningEventService,
      useFactory: (repository: PrismaLearningEventRepository) =>
        new LearningEventService({ repository }),
      inject: [LEARNING_EVENT_REPOSITORY],
    },
  ],
  exports: [LearningEventService],
})
export class LearningEventsModule {}
