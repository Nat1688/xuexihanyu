import { Controller, Get, Header, HttpCode, Inject, Optional, Res } from '@nestjs/common';

import {
  DATABASE_PROBE,
  ReadinessService,
  type DatabaseProbe,
  type ReadinessResult,
} from '../foundation/logging/readiness';

/** Minimal response surface for dynamically setting the readiness status. */
interface StatusResponse {
  status?(code: number): void;
}

/**
 * Health scaffold (ADR-005; extended by CLP-00-10).
 *
 * Exposes SAFE liveness and readiness probes only. Responses intentionally
 * contain no credentials, full configuration, schema, internal topology, stack
 * traces or connection URLs.
 *
 * Readiness distinction (CLP-00-10):
 *   - `/health/live`  — process liveness only; always 200 while the process
 *     answers. Never touches a dependency.
 *   - `/health/ready` — application readiness PLUS a SAFE dependency state:
 *       * `not-configured` — no database is wired (skeleton / DB-less env) → 200;
 *       * `up`             — the database answered a trivial probe          → 200;
 *       * `down`           — the database did not answer                    → 503,
 *                            with NO internal error/URL/schema leaked.
 *
 * The controller never throws on a dependency failure: it reports the coarse
 * state only, so a downed database cannot leak internals through the probe.
 */
@Controller()
export class HealthController {
  private readonly readiness: ReadinessService;

  constructor(
    @Optional() @Inject(DATABASE_PROBE) probe?: DatabaseProbe,
    @Optional() readiness?: ReadinessService,
  ) {
    // A pre-built service (tests) wins; otherwise wrap the injected probe.
    this.readiness = readiness ?? new ReadinessService({ probe });
  }

  @Get('health/live')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  @Header('Cache-Control', 'no-store')
  async ready(
    @Res({ passthrough: true }) res: StatusResponse,
  ): Promise<{ status: 'ok' | 'error'; dependencies: ReadinessResult }> {
    const dependencies = await this.readiness.check();
    const ready = dependencies.database !== 'down';
    res.status?.(ready ? 200 : 503);
    return { status: ready ? 'ok' : 'error', dependencies };
  }
}
