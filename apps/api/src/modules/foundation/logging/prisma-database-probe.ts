/**
 * Prisma-backed readiness probe (CLP-00-10).
 *
 * Adapts the shared {@link PrismaService} to the {@link DatabaseProbe} port by
 * issuing a trivial `SELECT 1`. It returns NOTHING on success and THROWS on
 * failure — the caller ({@link ReadinessService}) collapses any failure into the
 * coarse `'down'` state, so the underlying error (which may contain a
 * connection URL or schema) NEVER reaches the health response or the logs.
 *
 * The probe is deliberately tiny and read-only.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma.service';
import { type DatabaseProbe } from './readiness';

@Injectable()
export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<void> {
    // A trivial, read-only liveness query. Any thrown error is swallowed by
    // ReadinessService and reported only as 'down'.
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
