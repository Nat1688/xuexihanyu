/**
 * In-memory mastery test support (CP-04).
 *
 * Dependency-free fakes for the {@link MasteryEventReader} (read-only) and
 * {@link MasteryProjectionRepository} (replaceable) ports, plus a factory for
 * the {@link MasteryService}. They mirror the persistence invariants the Prisma
 * adapters rely on — deterministic ordering, idempotent upsert-by-key,
 * replaceable/clearable projection — closely enough to exercise the service,
 * the reducer and the rebuild/replay invariants without PostgreSQL.
 *
 * The event-reader fake is READ-ONLY by construction (no append/update/delete):
 * CP-04 must not be able to mutate evidence through it.
 */
import { type StoredLearningEvent } from '../../src/modules/learning-events/domain';
import { orderEvents } from '../../src/modules/learning-events/domain';
import { type MasteryEventReader } from '../../src/modules/mastery/application/mastery-event-reader';
import {
  type MasteryProjectionRepository,
  type ProjectionKey,
} from '../../src/modules/mastery/application/mastery-projection-repository';
import {
  MasteryService,
  type MasteryServiceDeps,
} from '../../src/modules/mastery/application/mastery-service';
import { type MasteryProjection } from '../../src/modules/mastery/domain';

/** Key helper mirrored from the repository adapters. */
function keyOf(actorPublicId: string, learningItemPublicId: string): string {
  return `${actorPublicId}\u0000${learningItemPublicId}`;
}

/**
 * Read-only, in-memory event reader. Constructed from a fixed list of events;
 * NO append/update/delete method exists so mastery code cannot mutate evidence.
 */
export class FakeMasteryEventReader implements MasteryEventReader {
  constructor(private readonly events: readonly StoredLearningEvent[]) {}

  async listByActor(actorPublicId: string): Promise<StoredLearningEvent[]> {
    return orderEvents(this.events.filter((e) => e.actorPublicId === actorPublicId));
  }

  async listAll(): Promise<StoredLearningEvent[]> {
    return orderEvents([...this.events]);
  }
}

/** Build a synthetic {@link StoredLearningEvent} for mastery tests. */
export function event(init: {
  publicId: string;
  type: StoredLearningEvent['type'];
  actorPublicId: string;
  occurredAt: Date;
  learningItemPublicId?: string | null;
  outcome?: string;
}): StoredLearningEvent {
  const metadata: Record<string, string> = {};
  if (init.outcome) metadata.outcome = init.outcome;
  return Object.freeze({
    publicId: init.publicId,
    type: init.type,
    schemaVersion: 1,
    actorPublicId: init.actorPublicId,
    refs: Object.freeze({
      coursePublicId: null,
      unitPublicId: null,
      lessonPublicId: null,
      learningItemPublicId: init.learningItemPublicId ?? null,
      exerciseRef: null,
    }),
    occurredAt: init.occurredAt,
    metadata: Object.freeze(metadata),
    createdAt: new Date(init.occurredAt.getTime() + 1),
  }) as StoredLearningEvent;
}

/** Replaceable, in-memory projection store. Idempotent upsert by (actor,item). */
export class FakeMasteryProjectionRepository implements MasteryProjectionRepository {
  private readonly rows = new Map<string, MasteryProjection>();

  /** Count of `clear()` calls (asserted by rebuild tests). */
  clearCount = 0;

  async find(key: ProjectionKey): Promise<MasteryProjection | null> {
    return this.rows.get(keyOf(key.actorPublicId, key.learningItemPublicId)) ?? null;
  }

  async listAll(): Promise<MasteryProjection[]> {
    return [...this.rows.values()].sort(
      (a, b) =>
        a.actorPublicId.localeCompare(b.actorPublicId) ||
        a.learningItemPublicId.localeCompare(b.learningItemPublicId),
    );
  }

  async listByActor(actorPublicId: string): Promise<MasteryProjection[]> {
    return (await this.listAll()).filter((p) => p.actorPublicId === actorPublicId);
  }

  async replace(projection: MasteryProjection): Promise<MasteryProjection> {
    this.rows.set(keyOf(projection.actorPublicId, projection.learningItemPublicId), projection);
    return projection;
  }

  async replaceMany(projections: readonly MasteryProjection[]): Promise<number> {
    let n = 0;
    for (const p of projections) {
      await this.replace(p);
      n += 1;
    }
    return n;
  }

  async clear(): Promise<number> {
    this.clearCount += 1;
    const n = this.rows.size;
    this.rows.clear();
    return n;
  }

  /** Test-only: how many derived rows are currently stored. */
  size(): number {
    return this.rows.size;
  }
}

/** Build a MasteryService over in-memory fakes. */
export function makeMasteryService(events: readonly StoredLearningEvent[] = []): {
  service: MasteryService;
  events: FakeMasteryEventReader;
  projections: FakeMasteryProjectionRepository;
} {
  const reader = new FakeMasteryEventReader(events);
  const store = new FakeMasteryProjectionRepository();
  const deps: MasteryServiceDeps = { events: reader, projections: store };
  return { service: new MasteryService(deps), events: reader, projections: store };
}
