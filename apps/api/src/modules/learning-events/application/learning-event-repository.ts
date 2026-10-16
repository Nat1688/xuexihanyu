/**
 * Learning-event repository PORT (CP-03).
 *
 * The port is DELIBERATELY APPEND-ONLY: it exposes a single `append` method and
 * a bounded `listByActor` read used only to prove ordering/append semantics.
 * There is intentionally NO `update`, `delete`, `upsert` or `replace` method —
 * mutation of evidence is impossible through the application boundary.
 *
 * The port speaks only in EXTERNAL (public) ids and domain value types; it
 * never leaks the internal surrogate keys.
 */
import { type NewLearningEvent, type StoredLearningEvent } from '../domain';

export interface LearningEventRepository {
  /**
   * Append one validated event. Returns the stored record with the
   * server-assigned public id and receipt time. There is no way to append a
   * replacement for an existing event.
   */
  append(event: NewLearningEvent): Promise<StoredLearningEvent>;

  /**
   * Return the actor's events in DETERMINISTIC order (occurredAt, then stable
   * id), bounded by `limit`. A read-only, evidence-inspection query — it is
   * NOT a progress/rollup projection.
   */
  listByActor(actorPublicId: string, limit: number): Promise<StoredLearningEvent[]>;
}
