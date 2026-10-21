/**
 * MasteryService (CP-04).
 *
 * The application entry point for deriving mastery/review state from immutable
 * CP-03 event evidence. It is DERIVE-ONLY: the service never writes or alters
 * learning events (it reads them through the read-only {@link MasteryEventReader}
 * port) and never reads the wall clock — the caller supplies `recomputedAt`.
 *
 * Three use-cases, all PURE-FUNCTION driven by the domain reducer:
 *
 *   - `deriveForActor(actorPublicId, recomputedAt)` — SAFE REFOLD: serialize
 *     derivation per actor, then fold every ordered event for each item and
 *     replace the row. Re-folding is required because delayed evidence retains
 *     its historical occurredAt and can arrive behind the stored cursor.
 *   - `replay(actorPublicId, recomputedAt)` — full re-derivation for one actor
 *     from ALL their ordered events, IGNORING the stored cursor (a rebuild
 *     scoped to one actor). Produces the same rows as an incremental pass.
 *   - `rebuild(recomputedAt)` — clear every derived row and re-derive from ALL
 *     events across all actors. The contract's replaceable/rebuildable path.
 *
 * All three produce identical projections for identical ordered evidence — the
 * "rebuild equals incremental" invariant, asserted by tests.
 *
 * There is NO: LLM/AI decision, random scheduling, manual direct state-update
 * endpoint, or event mutation. State is a deterministic function of evidence.
 */
import { orderEvents } from '../../learning-events/domain';
import { type StoredLearningEvent } from '../../learning-events/domain';
import {
  deriveProjection,
  groupKeyedEvents,
  type MasteryEvidenceEvent,
  type MasteryProjection,
} from '../domain';
import { type MasteryEventReader } from './mastery-event-reader';
import { type MasteryDerivationLock } from './mastery-derivation-lock';
import { type MasteryProjectionRepository } from './mastery-projection-repository';

export interface MasteryServiceDeps {
  readonly events: MasteryEventReader;
  readonly projections: MasteryProjectionRepository;
  /** Production supplies a PostgreSQL-backed cross-process actor lock. */
  readonly lock: MasteryDerivationLock;
}

export class MasteryService {
  constructor(private readonly deps: MasteryServiceDeps) {}

  /**
   * Derive one actor under the configured cross-process lock. Each item is
   * re-folded from all ordered evidence so delayed historical events cannot be
   * skipped. Idempotent and deterministic. Read-only over events.
   */
  async deriveForActor(actorPublicId: string, recomputedAt: Date): Promise<MasteryProjection[]> {
    return this.deps.lock.runExclusive(actorPublicId, (resources) =>
      this.deriveForActorUnlocked(
        actorPublicId,
        recomputedAt,
        resources.events,
        resources.projections,
      ),
    );
  }

  private async deriveForActorUnlocked(
    actorPublicId: string,
    recomputedAt: Date,
    eventsReader: MasteryEventReader,
    projectionRepository: MasteryProjectionRepository,
  ): Promise<MasteryProjection[]> {
    const events = orderEvents(await eventsReader.listByActor(actorPublicId));
    const groups = groupKeyedEvents(asEvidence(events));

    const results: MasteryProjection[] = [];
    for (const group of groups.values()) {
      if (group.actorPublicId !== actorPublicId) continue;
      // Re-fold the complete ordered group. An event may be appended late with
      // its original historical occurredAt, so a timestamp cursor alone cannot
      // distinguish it from evidence already folded on an earlier pass.
      const projection = deriveProjection(
        actorPublicId,
        group.learningItemPublicId,
        group.events,
        recomputedAt,
      );
      results.push(await projectionRepository.replace(projection));
    }
    return results;
  }

  /**
   * FULL re-derivation for one actor from ALL their ordered events, ignoring any
   * stored cursor. Replaces every projection for the actor. Used to prove
   * "rebuild scoped to an actor equals incremental".
   */
  async replay(actorPublicId: string, recomputedAt: Date): Promise<MasteryProjection[]> {
    const events = orderEvents(await this.deps.events.listByActor(actorPublicId));
    const projections = this.deriveAll(asEvidence(events), recomputedAt);
    await this.deps.projections.replaceMany(projections);
    return projections;
  }

  /**
   * REBUILD every derived projection: clear the projection store, re-derive
   * from ALL events across all actors, and replace. This is the explicit,
   * bounded reprocessing command the contract permits; it NEVER runs
   * implicitly and NEVER mutates events.
   */
  async rebuild(recomputedAt: Date): Promise<{ cleared: number; written: number }> {
    const cleared = await this.deps.projections.clear();
    const events = orderEvents(await this.deps.events.listAll());
    const projections = this.deriveAll(asEvidence(events), recomputedAt);
    const written = await this.deps.projections.replaceMany(projections);
    return { cleared, written };
  }

  /** Read one actor's derived projections (ordered by item). Read-only. */
  async listByActor(actorPublicId: string): Promise<MasteryProjection[]> {
    return this.deps.projections.listByActor(actorPublicId);
  }

  /** Read all derived projections (ordered by actor, item). Read-only. */
  async listAll(): Promise<MasteryProjection[]> {
    return this.deps.projections.listAll();
  }

  /**
   * Pure: derive projections for EVERY (actor, item) group from a fully ordered
   * event list. Shared by `replay` and `rebuild` so both are guaranteed to use
   * the identical reduction.
   */
  private deriveAll(
    events: readonly MasteryEvidenceEvent[],
    recomputedAt: Date,
  ): MasteryProjection[] {
    const groups = groupKeyedEvents(events);
    const out: MasteryProjection[] = [];
    for (const group of groups.values()) {
      out.push(
        deriveProjection(
          group.actorPublicId,
          group.learningItemPublicId,
          group.events,
          recomputedAt,
        ),
      );
    }
    return out;
  }
}

/** View stored CP-03 events as mastery evidence (read-only; no field is written). */
function asEvidence(events: readonly StoredLearningEvent[]): MasteryEvidenceEvent[] {
  return events as readonly StoredLearningEvent[] as unknown as MasteryEvidenceEvent[];
}
