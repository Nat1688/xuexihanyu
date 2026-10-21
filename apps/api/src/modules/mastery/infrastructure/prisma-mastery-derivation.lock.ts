import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type MasteryDerivationLock,
  type MasteryDerivationResources,
} from '../application/mastery-derivation-lock';
import { PrismaMasteryEventReader } from './prisma-mastery-event.reader';
import { PrismaMasteryProjectionRepository } from './prisma-mastery-projection.repository';

/**
 * PostgreSQL-backed actor mutex for the read-compute-replace derivation cycle.
 *
 * A transaction-scoped advisory lock avoids a schema change and works across
 * API processes without locking the actor row needed by projection foreign-key
 * checks. Hash collisions only over-serialize unrelated actors; they cannot
 * weaken integrity. Every production derive path acquires this same lock.
 */
@Injectable()
export class PrismaMasteryDerivationLock implements MasteryDerivationLock {
  constructor(private readonly prisma: PrismaService) {}

  async runExclusive<T>(
    actorPublicId: string,
    operation: (resources: MasteryDerivationResources) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<Array<{ locked: number }>>`
          SELECT 1 AS "locked"
          FROM pg_advisory_xact_lock(
            hashtextextended(${actorPublicId}::text, 112933765::bigint)
          )
        `;
        return operation({
          events: new PrismaMasteryEventReader(tx),
          projections: new PrismaMasteryProjectionRepository(tx),
        });
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  }
}
