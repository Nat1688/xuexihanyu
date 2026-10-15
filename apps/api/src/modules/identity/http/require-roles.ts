/**
 * Role authorization metadata + policy (CLP-00-07; ADR-004).
 *
 * This is the AUTHORIZATION vocabulary on top of the CLP-00-06 AUTHENTICATION
 * boundary. A route declares the roles it admits via {@link RequireRoles}; the
 * {@link RoleGuard} then enforces that declaration SERVER-SIDE, after the
 * session has already been resolved by the `AuthGuard`.
 *
 * Design constraints (task contract CLP-00-07):
 *   - The admitted set is validated against the approved CP-00 role vocabulary
 *     (`ADMIN`, `TEACHER`, `STUDENT`) — an unknown role in a declaration is a
 *     programming error and fails fast.
 *   - The policy is PURE: given the caller's roles and the required set it
 *     returns a boolean. It reads NO session snapshot and persists nothing; the
 *     caller's roles always come from the current server-side resolution.
 *   - This module performs NO role mutation and no object/ownership policy; it
 *     answers "does the authenticated principal hold one of the required
 *     roles?", nothing more.
 */
import { SetMetadata } from '@nestjs/common';

import { isRole, type Role } from '../domain/role';

/** Metadata key under which {@link RequireRoles} stores the admitted roles. */
export const ROLES_METADATA_KEY = 'clp:roles';

/**
 * Declare the roles a route admits. At least one approved role is required.
 *
 * The values are validated eagerly so a typo (`'TEACHER '`, `'SUPERADMIN'`)
 * throws at module-definition time rather than silently failing open at
 * request time.
 */
export function RequireRoles(...roles: readonly Role[]): MethodDecorator & ClassDecorator {
  if (roles.length === 0) {
    throw new InvalidRoleDeclarationError('at least one role must be declared');
  }
  for (const role of roles) {
    if (!isRole(role)) {
      throw new InvalidRoleDeclarationError(`unsupported role: ${String(role)}`);
    }
  }
  // De-duplicate while preserving declaration order for deterministic metadata.
  const unique = [...new Set(roles)];
  return SetMetadata(ROLES_METADATA_KEY, unique);
}

/**
 * The pure authorization policy. Returns `true` iff the caller holds at least
 * one of the required roles.
 *
 * Both sides must already be validated {@link Role} values; this function does
 * not re-validate and never throws — it is a simple set-intersection test.
 * An empty `required` set returns `false` (no role matches). This is the
 * policy-level default; the {@link RoleGuard} only invokes it when a route
 * actually declared roles, so an authentication-only route is handled by the
 * guard's "no declaration" branch, not here.
 */
export function isRoleAllowed(callerRoles: readonly Role[], required: readonly Role[]): boolean {
  if (required.length === 0) return false;
  for (const role of callerRoles) {
    if (required.includes(role)) return true;
  }
  return false;
}

/** Raised when a `@RequireRoles(...)` declaration names an unsupported role. */
export class InvalidRoleDeclarationError extends Error {
  readonly code = 'IDENTITY_INVALID_ROLE_DECLARATION';
  constructor(detail: string) {
    super(`Invalid role declaration: ${detail}`);
    this.name = 'InvalidRoleDeclarationError';
  }
}
