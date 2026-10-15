import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import {
  DATABASE_PROBE,
  PrismaDatabaseProbe,
  ReadinessService,
  type DatabaseProbe,
} from '../foundation/logging';
import { PrismaService } from '../foundation/prisma.service';

/**
 * Health module — the only controller wired in CLP-00-02, extended in CLP-00-10.
 *
 * Provides the safe liveness/readiness scaffold. No auth, domain or DB
 * ENDPOINT is registered here.
 *
 * Readiness wiring (CLP-00-10): a database probe is wired ONLY when
 * `DATABASE_URL` is configured. Without it the readiness probe reports
 * `'not-configured'` — this keeps the DB-less test/skeleton environment honest
 * and keeps `npm test` independent of a running PostgreSQL, while a configured
 * runtime gets a real, safe PostgreSQL reachability check.
 *
 * The probe is read-only (`SELECT 1`) and any failure is collapsed by
 * {@link ReadinessService} into the coarse `'down'` state — never an internal
 * error, connection URL or schema.
 */
const databaseProbeProvider = {
  provide: DATABASE_PROBE,
  useFactory: (prisma: PrismaService): DatabaseProbe | undefined =>
    process.env.DATABASE_URL ? new PrismaDatabaseProbe(prisma) : undefined,
  inject: [PrismaService],
};

@Module({
  controllers: [HealthController],
  providers: [
    databaseProbeProvider,
    {
      provide: ReadinessService,
      useFactory: (probe?: DatabaseProbe): ReadinessService => new ReadinessService({ probe }),
      inject: [{ token: DATABASE_PROBE, optional: true }],
    },
  ],
  exports: [ReadinessService],
})
export class HealthModule {}
