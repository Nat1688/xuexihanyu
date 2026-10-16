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
 *   - `deriveForActor(actorPublicId, recomputedAt)` — INCREMENTAL: for each
 *     learning item the actor has evidence for, fold only events AFTER the
 *     stored projection's source-event cursor onto the existing projection,
 *     then replace the row. Idempotent: re-running with no new events leaves an
 *     equal projection.
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
  applyEvent,
  deriveProjection,
  groupKeyedEvents,
  initialProjection,
  withRecomputedAt,
  type MasteryEvidenceEvent,
  type MasteryProjection,
} from '../domain';
import { type MasteryEventReader } from './mastery-event-reader';
import { type MasteryProjectionRepository } from './mastery-projection-repository';

export interface MasteryServiceDeps {
  readonly events: MasteryEventReader;
  readonly projections: MasteryProjectionRepository;
}

export class MasteryService {
  constructor(private readonly deps: MasteryServiceDeps) {}

  /**
   * INCREMENTAL derivation for one actor. For each item with evidence, fold
   * only events strictly after the stored cursor onto the existing projection,
   * then replace the row. Items with no stored row start from the empty
   * projection. Idempotent and deterministic. Read-only over events.
   */
  async deriveForActor(actorPublicId: string, recomputedAt: Date): Promise<MasteryProjection[]> {
    const events = orderEvents(await this.deps.events.listByActor(actorPublicId));
    const groups = groupKeyedEvents(asEvidence(events));

    const results: MasteryProjection[] = [];
    for (const group of groups.values()) {
      if (group.actorPublicId !== actorPublicId) continue;
      const existing = await this.deps.projections.find({
        actorPublicId,
        learningItemPublicId: group.learningItemPublicId,
      });

      let projection = existing ?? initialProjection(actorPublicId, group.learningItemPublicId);

      for (const event of group.events) {
        if (!isAfterCursor(event, projection)) continue;
        projection = applyEvent(projection, event, recomputedAt);
      }
      const finalized = withRecomputedAt(projection, recomputedAt);
      results.push(await this.deps.projections.replace(finalized));
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

/**
 * Is the event strictly AFTER the projection's source-event cursor
 * `(lastEventAt, lastEventPublicId)`? Uses the SAME total order as event
 * ordering so incremental folding is reproducible.
 */
function isAfterCursor(event: MasteryEvidenceEvent, projection: MasteryProjection): boolean {
  if (!projection.lastEventAt) return true;
  const cursorMs = projection.lastEventAt.getTime();
  const eventMs = event.occurredAt.getTime();
  if (eventMs !== cursorMs) return eventMs > cursorMs;
  const cursorId = projection.lastEventPublicId ?? '';
  return event.publicId > cursorId;
}
