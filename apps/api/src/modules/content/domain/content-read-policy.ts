/**
 * Content read policy (CP-01).
 *
 * Read visibility is decided SERVER-SIDE and never by UI hiding. The rule is
 * intentionally small and pure so it is independently testable:
 *
 *   - ADMIN/TEACHER (content authors) may read any node, DRAFT or PUBLISHED.
 *   - A STUDENT may read ONLY `PUBLISHED` nodes.
 *   - An anonymous caller (no roles) may read ONLY `PUBLISHED` nodes.
 *
 * This governs retrieval only; it grants no mutation authority (see
 * `content-authorization.ts`). No student-progress/enrollment concept exists in
 * CP-01, so no per-student filtering applies.
 */
import { type Role } from '../../identity/domain/role';
import { type ContentVisibility } from './visibility';

/** Roles that may read un-published (DRAFT) content. */
const PRIVILEGED_READ_ROLES: readonly Role[] = ['ADMIN', 'TEACHER'];

/**
 * May a caller with `roles` read a node at the given visibility? Deterministic
 * and side-effect free.
 */
export function canReadContent(visibility: ContentVisibility, roles: readonly Role[]): boolean {
  if (visibility === 'PUBLISHED') return true;
  return roles.some((role) => PRIVILEGED_READ_ROLES.includes(role));
}

/** Filter a list of nodes down to those the caller may read. */
export function filterReadable<T extends { visibility: ContentVisibility }>(
  nodes: readonly T[],
  roles: readonly Role[],
): T[] {
  return nodes.filter((node) => canReadContent(node.visibility, roles));
}
