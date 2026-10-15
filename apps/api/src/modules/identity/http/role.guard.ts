/**
 * Role authorization guard (CLP-00-07; ADR-004).
 *
 * Enforces AUTHORIZATION layered AFTER authentication. It assumes the caller
 * has already supplied a validated auth context (i.e. {@link AuthGuard} ran
 * first and populated `request.auth`); it never resolves a session itself, so
 * every decision is made on roles derived server-side from the current user's
 * membership.
 *
 * Behaviour:
 *   - No authenticated auth context  → {@link UnauthenticatedError} (401). This
 *     is the defence-in-depth path for a route that forgot to pair the
 *     {@link AuthGuard}; it keeps the failure uniform (401, not 403).
 *   - No `@RequireRoles(...)` declaration → allow (the route is
 *     AUTHENTICATION-ONLY; the paired {@link AuthGuard} already admitted the
 *     caller).
 *   - Authenticated but the caller's roles do not intersect the route's
 *     `@RequireRoles(...)` declaration → {@link ForbiddenError} (403).
 *   - Authenticated with a matching role → allow.
 *
 * The guard emits NO role/session/token detail in either failure. The
 * {@link AuthExceptionFilter} maps both errors to the ADR-005 contract bodies.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UnauthenticatedError } from '../application/auth-errors';
import { ForbiddenError } from '../application/auth-errors';
import { type Role } from '../domain/role';
import { type AuthenticatedRequest } from './authenticated-request';
import { isRoleAllowed, ROLES_METADATA_KEY } from './require-roles';

/** Read the `@RequireRoles(...)` metadata from the handler, falling back to the class. */
export function requiredRolesOf(
  reflector: Reflector,
  context: ExecutionContext,
): readonly Role[] | undefined {
  return reflector.getAllAndOverride<readonly Role[]>(ROLES_METADATA_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Authorization requires authentication. A missing auth context means the
    // route was not (correctly) preceded by the AuthGuard; fail closed with the
    // SAME uniform 401 rather than leaking that a role check exists.
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }

    // No `@RequireRoles(...)` declaration → the route is AUTHENTICATION-ONLY
    // (e.g. the internal "auth-only" representative route). The AuthGuard has
    // already admitted any authenticated caller, so there is no role policy to
    // enforce here. Absence of a declaration is NOT fail-open: the route is
    // still gated by authentication, and `@RequireRoles` itself rejects an
    // explicit empty declaration.
    const declared = requiredRolesOf(this.reflector, context);
    if (!declared) {
      return true;
    }

    if (!isRoleAllowed(auth.principal.roles, declared)) {
      // Authenticated but insufficient role → uniform 403 with no detail.
      throw new ForbiddenError();
    }
    return true;
  }
}
