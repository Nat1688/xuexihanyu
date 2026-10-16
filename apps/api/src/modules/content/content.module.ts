import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { IdentityModule } from '../identity/identity.module';
import { ContentService } from './application/content-service';
import { CONTENT_PUBLIC_ID_GENERATOR, CONTENT_REPOSITORY } from './application/tokens';
import { PrismaContentRepository } from './infrastructure/prisma-content.repository';
import { ContentController } from './http/content.controller';

/**
 * Content boundary (CP-01).
 *
 * Teacher-managed curriculum hierarchy and reusable Chinese-aware learning
 * items:
 *   - `domain/`         visibility + learning-item-kind vocabularies,
 *                       hierarchy/ordering/ownership validation, the
 *                       Chinese-kind learning-item contract, the read
 *                       visibility policy and the server-side mutation
 *                       authorization policy.
 *   - `application/`     `ContentRepository` port, `ContentService` use-cases,
 *                       DI tokens.
 *   - `infrastructure/`  Prisma-backed content store over the CP-01 tables.
 *   - `http/`            `ContentController` (routes guarded by the shared
 *                       `AuthGuard` + `RoleGuard`) and the content exception
 *                       filter/mapper.
 *
 * The module imports `IdentityModule` for the shared `AuthGuard`/`RoleGuard`
 * (authentication + role authorization). Per-object ownership authorization
 * (a TEACHER may mutate only their OWN content) is applied in `ContentService`
 * via the domain policy, since it depends on the node's recorded author.
 *
 * DELIBERATELY ABSENT (CP-01 forbidden): exercises/answers/evaluation (CP-02),
 * learning events (CP-03), mastery/review (CP-04), media storage/upload
 * providers, import/export, AI, analytics, public marketplace, assignment/
 * enrollment or student progress.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ContentController],
  providers: [
    { provide: CONTENT_REPOSITORY, useClass: PrismaContentRepository },
    // Fresh opaque external id for each authored node/item.
    { provide: CONTENT_PUBLIC_ID_GENERATOR, useFactory: () => () => randomUUID() },
    {
      provide: ContentService,
      useFactory: (repository: PrismaContentRepository, newPublicId: () => string) =>
        new ContentService({ repository, newPublicId }),
      inject: [CONTENT_REPOSITORY, CONTENT_PUBLIC_ID_GENERATOR],
    },
  ],
  exports: [ContentService],
})
export class ContentModule {}
