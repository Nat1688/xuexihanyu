import { Module } from '@nestjs/common';

import { MasteryService } from './application/mastery-service';
import { MASTERY_EVENT_READER, MASTERY_PROJECTION_REPOSITORY } from './application/tokens';
import { PrismaMasteryDerivationLock } from './infrastructure/prisma-mastery-derivation.lock';
import { PrismaMasteryEventReader } from './infrastructure/prisma-mastery-event.reader';
import { PrismaMasteryProjectionRepository } from './infrastructure/prisma-mastery-projection.repository';

/**
 * Mastery & Review boundary (CP-04).
 *
 * A DERIVED, REPLACEABLE projection over CP-03 evidence:
 *   - `domain/`          the closed mastery-state vocabulary
 *                        (`NEW`/`LEARNING`/`FAMILIAR`/`MASTERED`), the versioned
 *                        rule-version policy, the deterministic review-interval
 *                        schedule, the pure transition reducer
 *                        (`deriveProjection`/`applyEvent`) and typed errors.
 *   - `application/`      the READ-ONLY `MasteryEventReader` port, the
 *                        `MasteryProjectionRepository` (replaceable) port,
 *                        `MasteryService` use-cases (safe `deriveForActor`,
 *                        actor-scoped `replay`, full `rebuild`) and DI tokens.
 *   - `infrastructure/`   Prisma-backed read-only event reader + replaceable
 *                        projection repository over `mastery_projections`.
 *
 * The service is PURE-FUNCTION driven and clock-free: the caller supplies
 * `recomputedAt`. There is intentionally NO controller and NO UI in CP-04.
 *
 * `PrismaModule` is global, so `PrismaService` is injectable here without an
 * explicit import or provider.
 *
 * DELIBERATELY ABSENT (CP-04 forbidden): any LLM/AI decision, random scheduling,
 * manual direct state-update endpoint, event mutation, notification/reminder
 * job, analytics dashboard, teacher override UI, Student UI/TODAY flow,
 * unbounded implicit reprocessing (rebuild is explicit only), and any CP-05/06
 * feature.
 */
@Module({
  providers: [
    { provide: MASTERY_EVENT_READER, useClass: PrismaMasteryEventReader },
    {
      provide: MASTERY_PROJECTION_REPOSITORY,
      useClass: PrismaMasteryProjectionRepository,
    },
    PrismaMasteryDerivationLock,
    {
      provide: MasteryService,
      useFactory: (
        events: PrismaMasteryEventReader,
        projections: PrismaMasteryProjectionRepository,
        lock: PrismaMasteryDerivationLock,
      ) => new MasteryService({ events, projections, lock }),
      inject: [MASTERY_EVENT_READER, MASTERY_PROJECTION_REPOSITORY, PrismaMasteryDerivationLock],
    },
  ],
  exports: [MasteryService],
})
export class MasteryModule {}
