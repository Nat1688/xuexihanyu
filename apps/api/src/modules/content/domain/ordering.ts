/**
 * Hierarchy ordering + ownership validation (CP-01).
 *
 * The curriculum hierarchy is `course -> unit -> lesson`, ordered by a
 * non-negative integer `position` that is UNIQUE WITHIN its parent scope. These
 * pure helpers validate the parts of that contract the domain owns (a
 * non-negative integer position, a title/slug that is present and within
 * bounds) plus ownership semantics (a node's author must match the mutation
 * actor for teacher-managed authoring — enforced at the use-case layer).
 *
 * Nothing here touches persistence or HTTP; the database UNIQUE constraints are
 * the final backstop for position/slug collisions.
 */
import { ContentValidationError } from './content-errors';

/** Maximum slug length, aligned with the DB column (VARCHAR(160)). */
export const SLUG_MAX_LENGTH = 160;

/** Maximum title length, aligned with the DB column (VARCHAR(200)). */
export const TITLE_MAX_LENGTH = 200;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a hierarchy `position`: a non-negative, finite integer. Ordering
 * within a parent scope starts at 0 and is contiguous as far as the domain can
 * guarantee; collisions are rejected by the DB unique index.
 */
export function validatePosition(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ContentValidationError('position', 'must be a non-negative integer');
  }
  return value;
}

/** Validate a title: a non-empty string within the column bound. */
export function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ContentValidationError('title', 'must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ContentValidationError('title', 'must not be empty');
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new ContentValidationError('title', `must be at most ${TITLE_MAX_LENGTH} characters`);
  }
  return trimmed;
}

/** Validate a slug: lower-case alphanumeric words separated by single hyphens. */
export function validateSlug(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ContentValidationError('slug', 'must be a string');
  }
  if (value.length === 0) {
    throw new ContentValidationError('slug', 'must not be empty');
  }
  if (value.length > SLUG_MAX_LENGTH) {
    throw new ContentValidationError('slug', `must be at most ${SLUG_MAX_LENGTH} characters`);
  }
  if (!SLUG_PATTERN.test(value)) {
    throw new ContentValidationError(
      'slug',
      'must be lower-case words separated by single hyphens',
    );
  }
  return value;
}

/** Validate an optional description (nullable long text). */
export function validateDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ContentValidationError('description', 'must be a string when provided');
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Ownership predicate for teacher-managed authoring: the mutation actor owns
 * the node iff they are the recorded author. ADMINs are handled by the
 * authorization layer (they may author anything), so this predicate encodes the
 * TEACHER path only and is applied per the use-case's policy.
 */
export function isOwnedBy(authorId: string, actorId: string): boolean {
  return authorId === actorId;
}
