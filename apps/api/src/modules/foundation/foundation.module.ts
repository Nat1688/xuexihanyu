import { Module } from '@nestjs/common';

/**
 * Foundation boundary (ADR-001).
 *
 * Owns cross-cutting foundation contracts: configuration, error model, IDs,
 * clock, and health/logging interfaces. In CLP-00-02 this boundary exists as a
 * placeholder only — configuration and logging/error behavior are implemented
 * by later approved CP-00 tasks (CLP-00-03, CLP-00-10).
 */
@Module({})
export class FoundationModule {}
