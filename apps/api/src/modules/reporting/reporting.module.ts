import { Module } from '@nestjs/common';

/**
 * Reporting boundary (ADR-001 placeholder).
 *
 * Reserved for authorized read-model/projection aggregates for students and
 * teachers. It must never mutate authoritative learning evidence. No reporting
 * query or projection is implemented in CP-00.
 */
@Module({})
export class ReportingModule {}
