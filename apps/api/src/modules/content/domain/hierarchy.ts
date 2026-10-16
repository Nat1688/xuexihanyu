/**
 * Curriculum hierarchy node model (CP-01).
 *
 * A hierarchy node is one of course/unit/lesson. All three share the same
 * authored shape (slug, title, description, visibility, position) and differ
 * only by their parent scope: a course has none, a unit belongs to a course, a
 * lesson belongs to a unit. This module validates the shared authored shape so
 * the three levels cannot drift.
 *
 * Ordering: `position` is a non-negative integer UNIQUE WITHIN the parent scope
 * (enforced in the DB by the composite unique indexes). Ownership: `authorId` is
 * the server-derived actor for teacher-managed authoring.
 */
import { ContentValidationError } from './content-errors';
import { validateDescription, validatePosition, validateSlug, validateTitle } from './ordering';
import { type ContentVisibility, isContentVisibility } from './visibility';

/** The three hierarchy levels, top to bottom. */
export const HIERARCHY_LEVELS = ['COURSE', 'UNIT', 'LESSON'] as const;
export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number];

/** The shared, validated authored shape of a hierarchy node. */
export interface HierarchyNode {
  readonly publicId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: ContentVisibility;
  readonly position: number;
  readonly authorId: string;
}

/** Raw authored input for a node (pre-validation). */
export interface HierarchyNodeInput {
  slug: unknown;
  title: unknown;
  description?: unknown;
  visibility?: unknown;
  position?: unknown;
}

/**
 * Validate the shared authored shape of a hierarchy node. `publicId`/`authorId`
 * are server-derived and pass through unchanged. Defaults: visibility DRAFT,
 * position 0.
 */
export function makeHierarchyNode(
  input: HierarchyNodeInput & { publicId: string; authorId: string },
): HierarchyNode {
  let visibility: ContentVisibility = 'DRAFT';
  if (input.visibility !== undefined && input.visibility !== null) {
    if (!isContentVisibility(input.visibility)) {
      throw new ContentValidationError('visibility', 'must be DRAFT or PUBLISHED');
    }
    visibility = input.visibility;
  }

  return Object.freeze({
    publicId: input.publicId,
    slug: validateSlug(input.slug),
    title: validateTitle(input.title),
    description: validateDescription(input.description),
    visibility,
    position:
      input.position === undefined || input.position === null
        ? 0
        : validatePosition(input.position),
    authorId: input.authorId,
  });
}

/**
 * Ownership predicate for the TEACHER authoring path: a teacher may mutate a
 * node only when they authored it. ADMIN authority is a separate, role-based
 * decision handled by the authorization layer (see `content-authorization.ts`).
 */
export function teacherOwnsNode(node: { authorId: string }, actorId: string): boolean {
  return node.authorId === actorId;
}
