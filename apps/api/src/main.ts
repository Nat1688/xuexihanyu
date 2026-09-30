import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * API bootstrap (CLP-00-02 skeleton).
 *
 * Scope: bring up the Nest application and the safe health scaffold only.
 * No authentication, database connection, config loading or domain feature is wired here —
 * those belong to later approved CP-00 task contracts.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Development port comes from an environment variable NAME only; no secret or
  // privileged value is read or logged in this skeleton.
  const port = Number(process.env.API_PORT) || 3000;

  await app.listen(port);

  // Safe startup diagnostic: no config dump, no credentials, no internal topology.
  // eslint-disable-next-line no-console -- bootstrap logging is intentional; structured logging + redaction arrives with CLP-00-10.
  console.log(
    `CLP API listening on port ${port} (environment=${process.env.NODE_ENV || 'development'})`,
  );
}

void bootstrap();
