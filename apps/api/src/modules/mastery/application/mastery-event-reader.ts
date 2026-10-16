/**
 * Mastery event-reader PORT (CP-04).
 *
 * CP-04 CONSUMES CP-03 evidence but NEVER mutates it. This port is therefore
 * strictly READ-ONLY: it exposes a single bounded, deterministic read of an
 * actor's events. There is intentionally NO append/update/delete method — the
 * mastery boundary has no code path that can write or alter evidence.
 *
 * Reads are ordered deterministically by `(occurredAt, publicId)`, matching the
 * CP-03 ordering contract, so a replay/rebuild over the same rows is
 * reproducible.
 */
import { type StoredLearningEvent } from '../../learning-events/domain';

export interface MasteryEventReader {
  /**
   * Return one actor's events in DETERMINISTIC order (`occurredAt`, then stable
   * public id). Read-only; never mutates evidence.
   */
  listByActor(actorPublicId: string): Promise<StoredLearningEvent[]>;

  /**
   * Return ALL events for a full rebuild, in DETERMINISTIC order (`occurredAt`,
   * then stable public id). Used only by the explicit rebuild command.
   */
  listAll(): Promise<StoredLearningEvent[]>;
}
