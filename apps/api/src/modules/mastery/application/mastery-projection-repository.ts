/**
 * Mastery projection repository PORT (CP-04).
 *
 * The projection is DERIVED and REPLACEABLE. Unlike the append-only evidence
 * tables, this port deliberately DOES expose replace/upsert/clear operations —
 * a projection row may be recomputed and overwritten, and the whole projection
 * may be cleared and rebuilt. That is the contract's "replaceable/rebuildable"
 * requirement.
 *
 * The port NEVER touches `learning_events`: it only reads/writes the derived
 * projection store. Mutation methods here concern DERIVED rows, not evidence.
 *
 * The port speaks only in EXTERNAL (public) ids and domain value types; it
 * never leaks the internal surrogate keys.
 */
import { type MasteryProjection } from '../domain';

/** A projection key = the (actor, learning item) pair it is derived for. */
export interface ProjectionKey {
  readonly actorPublicId: string;
  readonly learningItemPublicId: string;
}

export interface MasteryProjectionRepository {
  /** Read one projection by its (actor, item) key, or null when absent. */
  find(key: ProjectionKey): Promise<MasteryProjection | null>;

  /** List every projection, deterministically ordered by (actor, item). */
  listAll(): Promise<MasteryProjection[]>;

  /** List one actor's projections, deterministically ordered by item. */
  listByActor(actorPublicId: string): Promise<MasteryProjection[]>;

  /**
   * Replace (insert-or-overwrite) ONE derived projection. Idempotent: writing
   * the same projection twice leaves a single, equal row.
   */
  replace(projection: MasteryProjection): Promise<MasteryProjection>;

  /**
   * Replace MANY derived projections in one call. Idempotent per key. Used by
   * the incremental and rebuild passes.
   */
  replaceMany(projections: readonly MasteryProjection[]): Promise<number>;

  /**
   * Remove every projection (used by a full rebuild before re-deriving). This
   * affects DERIVED rows only — evidence is untouched.
   */
  clear(): Promise<number>;
}
