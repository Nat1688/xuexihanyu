import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * Health module — the only controller wired in CLP-00-02.
 *
 * Provides the safe liveness/readiness scaffold required to prove build/start
 * behavior. No auth, DB or domain endpoint is registered here.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
