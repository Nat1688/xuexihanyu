import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ConfigError, loadServerConfig } from './config/config.loader';
import type { ServerConfig } from './config/config.schema';
import {
  buildStartupDiagnostic,
  configErrorKeys,
  StructuredLogger,
  toRedactedRecord,
} from './modules/foundation/logging';

/**
 * API bootstrap (CLP-00-02 skeleton + CLP-00-03 config boundary + CLP-00-10
 * operational baseline).
 *
 * Configuration is read through the typed, validated boundary
 * (`loadServerConfig`). Invalid or missing required configuration aborts
 * startup with a SAFE, structured diagnostic (key names only, never values) and
 * a non-zero exit code.
 *
 * CLP-00-10 adds: a structured, redacted JSON logger used for the whole
 * application; safe startup diagnostics for the config / Prisma(database) /
 * HTTP phases (no stack, no URL, no secret value); and a request/correlation id
 * on every request. Still no authentication, authorization, or feature domain
 * behavior is added here.
 */
async function bootstrap(): Promise<void> {
  // Structured, redacting logger for the bootstrap phase. Wired as the Nest
  // application logger below so every Nest log line is structured + redacted.
  const logger = new StructuredLogger({ context: 'Bootstrap' });

  let config: Readonly<ServerConfig>;
  try {
    config = loadServerConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Safe diagnostic: names the offending keys, never their values.
      const diagnostic = buildStartupDiagnostic('config', error, configErrorKeys(error));
      logger.error('startup.failed', toRedactedRecord(diagnostic));
      process.exit(1);
    }
    // Unexpected config-phase error: still safe, still non-zero exit.
    logger.error('startup.failed', toRedactedRecord(buildStartupDiagnostic('config', error)));
    process.exit(1);
  }

  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  try {
    app = await NestFactory.create(AppModule, { logger });
  } catch (error) {
    // Failures here are Prisma/module-wiring failures. Report ONLY the phase
    // and a coarse category — never a stack, URL or schema.
    logger.error('startup.failed', toRedactedRecord(buildStartupDiagnostic('prisma', error)));
    process.exit(1);
  }

  // Structured application logger for the running app (all Nest levels).
  app.useLogger(logger);

  // Credentialed CORS for the explicit SPA origin ONLY (ADR-003). No `*`, no
  // origin reflection, minimal methods/headers; the SPA origin is typed config
  // that fails closed if absent/invalid. Credentials are enabled so the browser
  // sends/receives the session cookie. This is not a CSRF control by itself —
  // state-changing routes ALSO require the double-submit CSRF proof.
  app.enableCors({
    origin: [config.SPA_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    maxAge: 600,
  });

  try {
    await app.listen(config.API_PORT);
  } catch (error) {
    logger.error('startup.failed', toRedactedRecord(buildStartupDiagnostic('http', error)));
    await app.close().catch(() => undefined);
    process.exit(1);
  }

  // Safe startup diagnostic: no config dump, no credentials, no topology.
  logger.event('log', 'startup.listening', {
    port: config.API_PORT,
    environment: config.NODE_ENV,
  });
}

void bootstrap();
