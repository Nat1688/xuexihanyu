import { Controller, Get, Header, HttpCode } from '@nestjs/common';

/**
 * Health scaffold (ADR-005).
 *
 * Exposes SAFE liveness and readiness probes only. Responses intentionally
 * contain no credentials, full configuration, schema, internal topology or
 * stack traces.
 *
 * NOTE (CLP-00-02 scope): readiness here reports process/application
 * readiness only. Dependency readiness (e.g. PostgreSQL reachability) is added
 * by a later approved task (CLP-00-10) once persistence exists. This scaffold
 * must not be read as "database is ready".
 */
@Controller()
export class HealthController {
  @Get('health/live')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  ready(): { status: 'ok'; dependencies: { database: 'not-configured' } } {
    // Honest, non-enumerating readiness: persistence is not part of this skeleton.
    return { status: 'ok', dependencies: { database: 'not-configured' } };
  }
}
