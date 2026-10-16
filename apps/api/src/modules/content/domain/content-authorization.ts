/**
 * Content mutation authorization (CP-01).
 *
 * CP-01 constraint: "All authoring mutations require TEACHER/ADMIN server-side
 * authorization." This module is the single, pure decision point for that
 * policy. It is deliberately independent of Nest/HTTP so the full matrix is unit
 * testable, and it is ALWAYS evaluated server-side against the caller's CURRENT
 * role membership (never a client claim, never a session snapshot).
 *
 * Policy:
 *
 *   | Role        | may author (create) | may mutate any node | may mutate own node |
 *   |-------------|---------------------|---------------------|---------------------|
 *   | ADMIN       | yes                 | yes                 | yes                 |
 *   | TEACHER     | yes                 | no                  | yes                 |
 *   | STUDENT     | no                  | no                  | no                  |
 *   | (anonymous) | no                  | no                  | no                  |
 *
 * "Own node" means the node's recorded `authorId` equals the caller's user id.
 * A TEACHER who is not the author is refused (uniform forbidden). An ADMIN is
 * never restricted by ownership.
 */
import { ForbiddenError } from '../../identity/application/auth-errors';
import { type Role } from '../../identity/domain/role';

/** The caller context the policy evaluates against (server-derived). */
export interface ContentActor {
  readonly userId: string;
  readonly roles: readonly Role[];
}

/** Roles permitted to author/mutate content at all. */
const AUTHORING_ROLES: readonly Role[] = ['ADMIN', 'TEACHER'];

/** True when the actor holds a role that may author content. */
export function canAuthorContent(actor: ContentActor): boolean {
  return actor.roles.some((role) => AUTHORING_ROLES.includes(role));
}

/** True when the actor is an ADMIN (unrestricted across owned content). */
export function isAdmin(actor: ContentActor): boolean {
  return actor.roles.includes('ADMIN');
}

/**
 * Decide whether `actor` may MUTATE the node authored by `authorId`. Throws
 * {@link ForbiddenError} (mapped to a uniform 403) otherwise. A TEACHER may
 * mutate only their own node; an ADMIN may mutate any.
 */
export function assertCanMutateContent(actor: ContentActor, authorId: string): void {
  if (!canAuthorContent(actor)) {
    throw new ForbiddenError();
  }
  if (isAdmin(actor)) return;
  // Non-admin authoring caller is necessarily a TEACHER here; restrict to own.
  if (actor.userId !== authorId) {
    throw new ForbiddenError();
  }
}

/**
 * Decide whether `actor` may CREATE content. Throws {@link ForbiddenError}
 * otherwise. Creation has no prior owner, so only the role gate applies.
 */
export function assertCanCreateContent(actor: ContentActor): void {
  if (!canAuthorContent(actor)) {
    throw new ForbiddenError();
  }
}
