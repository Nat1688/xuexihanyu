import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { AiModule } from './modules/ai/ai.module';
import { ContentModule } from './modules/content/content.module';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { FoundationModule } from './modules/foundation/foundation.module';
import { PrismaModule } from './modules/foundation/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { LearningEventsModule } from './modules/learning-events/learning-events.module';
import { MasteryModule } from './modules/mastery/mastery.module';
import { ReportingModule } from './modules/reporting/reporting.module';

/**
 * Root application module.
 *
 * Wires the module boundaries required by ADR-001 plus the cross-cutting
 * `ConfigModule` (CLP-00-03 typed config) and `PrismaModule` (CLP-00-06 shared
 * client). Domain modules beyond identity/health remain EMPTY placeholders: they
 * define a boundary but contain no CP-01+ behavior, schema or persistence.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    FoundationModule,
    HealthModule,
    IdentityModule,
    ContentModule,
    ExerciseModule,
    LearningEventsModule,
    MasteryModule,
    ReportingModule,
    AiModule,
  ],
})
export class AppModule {}
