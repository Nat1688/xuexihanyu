import { Module } from '@nestjs/common';

/**
 * Identity boundary (ADR-001, ADR-004).
 *
 * Future home of users, credentials, sessions, roles and server-side
 * authorization policy. CLP-00-02 adds the boundary ONLY: no schema, migration,
 * login/logout endpoint, session table or RBAC implementation is created here.
 * Functional Identity arrives via later approved CP-00 tasks (CLP-00-05/06/07).
 */
@Module({})
export class IdentityModule {}
