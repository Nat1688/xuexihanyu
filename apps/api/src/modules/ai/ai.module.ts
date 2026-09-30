import { Module } from '@nestjs/common';

/**
 * AI boundary (CP-07+ placeholder).
 *
 * Reserved for provider-neutral AI orchestration and authorized application
 * tools. Per the AI isolation invariant, the application core must never depend
 * on an AI provider: no provider SDK is imported here in CP-00 (or ever, from
 * the core boundary).
 */
@Module({})
export class AiModule {}
