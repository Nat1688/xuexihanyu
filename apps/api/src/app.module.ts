import { Module } from '@nestjs/common';

import { AiModule } from './modules/ai/ai.module';
import { ContentModule } from './modules/content/content.module';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { FoundationModule } from './modules/foundation/foundation.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { LearningEventsModule } from './modules/learning-events/learning-events.module';
import { MasteryModule } from './modules/mastery/mastery.module';
import { ReportingModule } from './modules/reporting/reporting.module';

/**
 * Root application module.
 *
 * Wires the module boundaries required by ADR-001. All domain modules except
 * `foundation` and the `health` scaffold are EMPTY placeholders: they define a
 * boundary but contain no CP-01+ behavior, schema or persistence.
 */
@Module({
  imports: [
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
