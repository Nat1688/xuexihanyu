import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { AiModule } from './modules/ai/ai.module';
import { ContentModule } from './modules/content/content.module';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { FoundationModule } from './modules/foundation/foundation.module';
import { FoundationLoggingModule } from './modules/foundation/logging/foundation-logging.module';
import { RequestIdMiddleware } from './modules/foundation/logging/request-id.middleware';
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
 * `ConfigModule` (CLP-00-03 typed config), `PrismaModule` (CLP-00-06 shared
 * client) and `FoundationLoggingModule` (CLP-00-10 request/correlation id).
 * `IdentityModule` provides identity/session/role authorization, and
 * `ContentModule` provides the CP-01 content domain, `ExerciseModule` the CP-02
 * exercise boundary, `LearningEventsModule` the CP-03 append-only event
 * foundation, and `MasteryModule` the CP-04 derived mastery/review projection.
 * Domain modules beyond those remain EMPTY placeholders: they define a boundary
 * but contain no CP-05+ behavior, schema or persistence.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    FoundationModule,
    FoundationLoggingModule,
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
export class AppModule implements NestModule {
  /**
   * Attach the request/correlation id middleware to every route (CLP-00-10).
   * It resolves/echoes a safe correlation id and never mutates app state.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
