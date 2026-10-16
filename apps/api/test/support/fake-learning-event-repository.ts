/**
 * In-memory learning-event repository fake (CP-03 test support).
 *
 * A dependency-free implementation of the {@link LearningEventRepository} port
 * used by unit/e2e tests so they never touch PostgreSQL. It mirrors the
 * persistence invariants the real Prisma adapter relies on — APPEND-ONLY
 * semantics, public-id assignment, and deterministic read ordering — closely
 * enough to exercise the service layer.
 *
 * By design it exposes NO update/delete/replace method: the port declares none
 * and this fake adds none. Tests assert that absence to prove the application
 * boundary cannot mutate evidence.
 */
import {
  orderEvents,
  type NewLearningEvent,
  type StoredLearningEvent,
} from '../../src/modules/learning-events/domain';
import { type LearningEventRepository } from '../../src/modules/learning-events/application/learning-event-repository';
import {
  LearningEventService,
  type LearningEventServiceDeps,
} from '../../src/modules/learning-events/application/learning-event-service';

export class FakeLearningEventRepository implements LearningEventRepository {
  private readonly rows: StoredLearningEvent[] = [];

  /** Count of appends performed (for append-too-few/many assertions). */
  appendCount = 0;

  constructor(
    /** Public ids assigned on append; deterministic for tests. */
    private readonly newPublicId: () => string = defaultIds(),
    /** Optional fixed receipt clock for `createdAt`. */
    private readonly now: () => Date = () => new Date('2026-10-16T00:00:00.000Z'),
  ) {}

  async append(event: NewLearningEvent): Promise<StoredLearningEvent> {
    this.appendCount += 1;
    const stored: StoredLearningEvent = {
      publicId: this.newPublicId(),
      type: event.type,
      schemaVersion: event.schemaVersion,
      actorPublicId: event.actorPublicId,
      refs: event.refs,
      occurredAt: event.occurredAt,
      metadata: event.metadata,
      createdAt: this.now(),
    };
    this.rows.push(stored);
    return stored;
  }

  async listByActor(actorPublicId: string, limit: number): Promise<StoredLearningEvent[]> {
    const filtered = this.rows.filter((r) => r.actorPublicId === actorPublicId);
    // Deliberately return in INSERTION order so the service's deterministic
    // ordering is exercised (defense in depth).
    return filtered.slice(0, limit);
  }

  /** Test-only inspector: the rows currently held (a copy). */
  snapshot(): StoredLearningEvent[] {
    return orderEvents(this.rows);
  }
}

/** Construct a LearningEventService over the fake with injectable id/clock. */
export function makeLearningEventService(
  repository: LearningEventRepository = new FakeLearningEventRepository(),
): LearningEventService {
  const deps: LearningEventServiceDeps = { repository };
  return new LearningEventService(deps);
}

function defaultIds(): () => string {
  let n = 0;
  return () => `evt-${String(++n).padStart(6, '0')}`;
}
