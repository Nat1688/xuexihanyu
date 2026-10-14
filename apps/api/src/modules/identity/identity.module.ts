import { Module } from '@nestjs/common';

/**
 * Identity boundary (ADR-001, ADR-004).
 *
 * CLP-00-05 adds the identity PERSISTENCE and DOMAIN boundary only:
 *   - `domain/`         account state, roles, login normalization, public id,
 *                       password-hash value type, identity aggregate.
 *   - `application/`     the `PasswordHasher` port (hashing boundary).
 *   - `infrastructure/`  the scrypt (memory-hard) hasher implementation.
 *
 * Still DELIBERATELY ABSENT here (later approved tasks): login/logout/
 * current-user endpoints, session/cookie/CSRF handling and tables, RBAC
 * guards/policy, profiles/classes/enrollment. See CLP-00-06/07.
 */
@Module({})
export class IdentityModule {}
