import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Prisma module (CLP-00-06).
 *
 * Exposes the shared {@link PrismaService} globally so infrastructure adapters
 * (session/identity repositories) can inject it without each feature module
 * re-declaring the provider. Marked `@Global` because Prisma is a process-wide
 * singleton resource, not a domain-feature concern.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
