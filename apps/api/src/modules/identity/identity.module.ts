import { RegistrationService } from './application/registration.service';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { SERVER_CONFIG } from '../../config/config.module';
import { type ServerConfig } from '../../config/config.schema';
import { AuthService } from './application/auth-service';
import { LoginRateLimiter } from './application/login-rate-limiter';
import { IDENTITY_REPOSITORY, PASSWORD_HASHER, SESSION_REPOSITORY } from './application/tokens';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';
import { AUTH_CONTROLLER_OPTIONS, AuthController } from './http/auth.controller';
import { AuthExceptionFilter } from './http/auth-exception.filter';
import { AuthGuard } from './http/auth.guard';
import { Cp00AuthorizationController } from './http/cp00-authorization.controller';
import { RoleGuard } from './http/role.guard';

/**
 * Identity boundary (ADR-001, ADR-003, ADR-004).
 *
 * CLP-00-05 added the identity PERSISTENCE and DOMAIN boundary. CLP-00-06 adds
 * AUTHENTICATION & SESSION LIFECYCLE on top of it:
 *   - `domain/`         account state, roles, login normalization, public id,
 *                       password-hash value type, identity aggregate,
 *                       session value/validity rules, opaque token + CSRF.
 *   - `application/`     `PasswordHasher`/`IdentityRepository`/`SessionRepository`
 *                       ports, `LoginRateLimiter`, `AuthService`, auth errors,
 *                       cookie policy.
 *   - `infrastructure/`  scrypt hasher + Prisma-backed identity/session stores.
 *   - `http/`            `AuthController` (login/logout/me/session) + `AuthGuard`
 *                       (AUTHENTICATION ONLY) + CLP-00-07 `RoleGuard` /
 *                       `@RequireRoles` authorization and the representative
 *                       CP-00 authorization routes.
 *
 * CLP-00-07 adds server-side ROLE AUTHORIZATION on top of authentication: the
 * `RoleGuard` (layered after `AuthGuard`) enforces a `@RequireRoles(...)`
 * declaration against the principal's CURRENT server-side role membership — no
 * session role snapshot is stored, and caller roles are re-resolved per request.
 * Role mutation, object/ownership policy and any domain table are deliberately
 * OUT of scope here.
 *
 * Still DELIBERATELY ABSENT (later approved tasks): role mutation API/UI,
 * profiles/classes/enrollment/ownership; password reset/SSO; ENROLL-01 now adds STUDENT-only self-registration;
 * production cookie-domain/TLS config.
 */
@Module({
  controllers: [AuthController, Cp00AuthorizationController],
  providers: [
    RegistrationService,
    ScryptPasswordHasher,
    // Hashing boundary (CLP-00-05) — reused for password verification.
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    // Persistence ports (CLP-00-06).
    { provide: IDENTITY_REPOSITORY, useClass: PrismaIdentityRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    // Bounded in-memory login limiter (development implementation; ADR-003).
    { provide: LoginRateLimiter, useFactory: () => new LoginRateLimiter() },
    // Auth use-cases (explicit factory keeps ports as interface types).
    {
      provide: AuthService,
      useFactory: (
        identity: PrismaIdentityRepository,
        sessions: PrismaSessionRepository,
        hasher: ScryptPasswordHasher,
        rateLimiter: LoginRateLimiter,
        config: Readonly<ServerConfig>,
      ) =>
        new AuthService({
          identity,
          sessions,
          hasher,
          rateLimiter,
          sessionTtlMs: config.SESSION_TTL_MINUTES * 60 * 1000,
        }),
      inject: [
        IDENTITY_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHER,
        LoginRateLimiter,
        SERVER_CONFIG,
      ],
    },
    // HTTP: guard + controller options (cookie policy by environment/TTL).
    AuthGuard,
    // CLP-00-07 role authorization guard (layered AFTER AuthGuard on routes).
    RoleGuard,
    // Maps the guard's application-level auth errors (thrown OUTSIDE the
    // controller's try/catch) to the ADR-005 401/403/429 bodies. Without this
    // the guard's UnauthenticatedError would surface as a generic 500.
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
    {
      provide: AUTH_CONTROLLER_OPTIONS,
      useFactory: (config: Readonly<ServerConfig>) => ({
        nodeEnv: config.NODE_ENV,
        spaOrigin: config.SPA_ORIGIN,
        sessionTtlMinutes: config.SESSION_TTL_MINUTES,
      }),
      inject: [SERVER_CONFIG],
    },
  ],
  exports: [AuthService, AuthGuard, LoginRateLimiter, RoleGuard],
})
export class IdentityModule {}
