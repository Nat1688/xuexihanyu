/**
 * Representative CP-00 authorization routes (CLP-00-07; ADR-004).
 *
 * These are TEST-ONLY SCAFFOLDING, not a public API commitment: they exist to
 * prove the server-side role guard behaves per the required matrix. They live
 * under the internal `/internal/cp00` prefix so they are unmistakably outside
 * any product surface and can be removed once real domain routes replace them.
 *
 * Three representative shapes cover the authorization matrix:
 *   - GET /internal/cp00/auth-only        — any authenticated caller.
 *   - GET /internal/cp00/teacher-or-admin — TEACHER or ADMIN.
 *   - GET /internal/cp00/admin-only       — ADMIN only.
 *
 * Every route is guarded by BOTH `AuthGuard` (authentication) and `RoleGuard`
 * (authorization), in that ORDER, so authorization only ever runs on a
 * server-resolved principal. Responses echo nothing role- or session-sensitive:
 * only the route id and the caller's public id.
 */
import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from './auth.guard';
import { type AuthenticatedRequest } from './authenticated-request';
import { RequireRoles } from './require-roles';
import { RoleGuard } from './role.guard';

/** The internal CP-00 authorization-route prefix. */
export const CP00_INTERNAL_PREFIX = 'internal/cp00';

@Controller(CP00_INTERNAL_PREFIX)
@UseGuards(AuthGuard, RoleGuard)
export class Cp00AuthorizationController {
  /** Authenticated-only: any valid session may call this. No role required. */
  @Get('auth-only')
  authOnly(@Req() req: AuthenticatedRequest): { route: string; publicId: string } {
    return { route: 'auth-only', publicId: req.auth!.principal.publicId };
  }

  /** TEACHER or ADMIN. A STUDENT is authenticated but not authorized (403). */
  @Get('teacher-or-admin')
  @RequireRoles('TEACHER', 'ADMIN')
  teacherOrAdmin(@Req() req: AuthenticatedRequest): { route: string; publicId: string } {
    return { route: 'teacher-or-admin', publicId: req.auth!.principal.publicId };
  }

  /** ADMIN only. */
  @Get('admin-only')
  @RequireRoles('ADMIN')
  adminOnly(@Req() req: AuthenticatedRequest): { route: string; publicId: string } {
    return { route: 'admin-only', publicId: req.auth!.principal.publicId };
  }
}
