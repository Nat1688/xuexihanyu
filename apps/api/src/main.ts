import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ConfigError, loadServerConfig } from './config/config.loader';
import type { ServerConfig } from './config/config.schema';

/**
 * API bootstrap (CLP-00-02 skeleton + CLP-00-03 config boundary).
 *
 * Configuration is read through the typed, validated boundary
 * (`loadServerConfig`). Invalid or missing required configuration aborts
 * startup with a SAFE diagnostic (key names only, never values) and a
 * non-zero exit code.
 *
 * Scope note: still no authentication, database connection or domain feature.
 * The validated config object is intentionally NOT dumped to logs.
 */
async function bootstrap(): Promise<void> {
  let config: Readonly<ServerConfig>;
  try {
    config = loadServerConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Safe diagnostic: names the offending keys, never their values.
      // eslint-disable-next-line no-console -- startup failure must be visible; structured logging arrives with CLP-00-10.
      console.error(`[config] ${error.name}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create(AppModule);

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

  await app.listen(config.API_PORT);

  // Safe startup diagnostic: no config dump, no credentials, no topology.
  // eslint-disable-next-line no-console -- bootstrap logging is intentional; structured logging + redaction arrives with CLP-00-10.
  console.log(`CLP API listening on port ${config.API_PORT} (environment=${config.NODE_ENV})`);
}

void bootstrap();
