/**
 * Foundation logging module (CLP-00-10).
 *
 * Wires the request/correlation id middleware and exposes the structured logger
 * as an injectable provider. Kept separate from `FoundationModule` so the
 * logging boundary is explicit and the request-id middleware is registered
 * exactly once (in the consumer's `configure()`).
 *
 * The readiness service is NOT provided here: the health module wires the
 * database probe it needs, so readiness has a single owner.
 */
import { Global, Module } from '@nestjs/common';

import { RequestIdMiddleware } from './request-id.middleware';
import { StructuredLogger } from './structured-logger';

@Global()
@Module({
  providers: [
    RequestIdMiddleware,
    { provide: StructuredLogger, useFactory: (): StructuredLogger => new StructuredLogger() },
  ],
  exports: [RequestIdMiddleware, StructuredLogger],
})
export class FoundationLoggingModule {}
