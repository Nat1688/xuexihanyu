/**
 * Prisma client provider (CLP-00-06).
 *
 * A single, injectable Prisma client for the API. It is instantiated from the
 * `DATABASE_URL` environment variable via the generated Prisma client — the
 * connection string is NEVER committed and never surfaced in logs/errors.
 *
 * Scope note: only CLP-00-06 (session lifecycle) consumes this. The API server
 * still owns no learning-domain repositories; those arrive in later approved
 * tasks. The client is closed on application shutdown so no connection leaks.
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // The Prisma client reads DATABASE_URL itself. We pass no explicit
    // datasource so tests can override it via `datasources` where needed.
    super();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (error) {
      // Never let teardown mask the real error; log category only.
      this.logger.warn(`Prisma disconnect failed: ${(error as Error).name}`);
    }
  }
}
