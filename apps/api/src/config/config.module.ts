import { Global, Module } from '@nestjs/common';

import { loadServerConfig } from './config.loader';
import { type ServerConfig } from './config.schema';

/** DI token for the validated, frozen {@link ServerConfig}. */
export const SERVER_CONFIG = Symbol('SERVER_CONFIG');

/**
 * Configuration module (CLP-00-03 boundary, first Nest-wired consumer CLP-00-06).
 *
 * Loads and validates the server configuration ONCE through the typed boundary
 * and exposes it as an injectable provider. This keeps the config/secret
 * boundary the single entry point for runtime configuration (no ad-hoc
 * `process.env` reads in feature code) while letting modules such as the
 * session/auth boundary consume the validated object.
 *
 * The provider VALUE is never logged. Invalid configuration still fails fast at
 * startup via `loadServerConfig` (which throws a value-free `ConfigError`).
 */
@Global()
@Module({
  providers: [
    {
      provide: SERVER_CONFIG,
      useFactory: (): Readonly<ServerConfig> => loadServerConfig(process.env),
    },
  ],
  exports: [SERVER_CONFIG],
})
export class ConfigModule {}
