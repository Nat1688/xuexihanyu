/**
 * Role membership values (CLP-00-05; ADR-004).
 *
 * Exactly three roles exist in CP-00. The values mirror the `UserRole` Prisma
 * enum 1:1. CP-00 defines the vocabulary and validation only — server-side
 * authorization policy/guards are CLP-00-07 and are deliberately NOT here.
 */
export const ROLES = ['ADMIN', 'TEACHER', 'STUDENT'] as const;

export type Role = (typeof ROLES)[number];

/** Type guard: is `value` an approved CP-00 role? */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Validate and return a role set, rejecting any unknown value. Membership is
 * normalized to a de-duplicated, canonically-ordered list so downstream code
 * never depends on input order.
 *
 * Throws {@link UnknownRoleError} on the first invalid value.
 */
export function validateRoles(values: readonly unknown[]): Role[] {
  const seen = new Set<Role>();
  for (const value of values) {
    if (!isRole(value)) {
      throw new UnknownRoleError(value);
    }
    seen.add(value);
  }
  // Canonical order (as declared in ROLES) for deterministic output.
  return ROLES.filter((role) => seen.has(role));
}

/** Raised when a role value outside the approved three is supplied. */
export class UnknownRoleError extends Error {
  readonly code = 'IDENTITY_UNKNOWN_ROLE';
  constructor(readonly value: unknown) {
    super('Unsupported role value');
    this.name = 'UnknownRoleError';
  }
}
