/**
 * LearningEventService (CP-03).
 *
 * The single application entry point for recording interaction evidence. It is
 * APPEND-ONLY by construction: the service exposes `record` (validate + append)
 * and a read-only `listByActor` for evidence inspection. It has NO update or
 * delete method, and it delegates every write to the append-only repository
 * port — there is no code path that can mutate a stored event.
 *
 * The service is deliberately thin: all validation lives in the pure domain
 * ({@link makeLearningEvent}); the service only orchestrates validate → append
 * and re-orders reads deterministically (defense in depth: even if the
 * repository returned an unordered list, the boundary sorts it).
 *
 * It carries NO progress/mastery logic (CP-04 forbidden) and does NOT read the
 * clock — the caller supplies `occurredAt`, the repository supplies receipt
 * time.
 */
import {
  makeLearningEvent,
  orderEvents,
  type AppendLearningEventInput,
  type StoredLearningEvent,
} from '../domain';
import { type LearningEventRepository } from './learning-event-repository';

/** Maximum page size for `listByActor` (a bounded, evidence-inspection read). */
export const MAX_LIST_LIMIT = 100;

export interface LearningEventServiceDeps {
  readonly repository: LearningEventRepository;
}

export class LearningEventService {
  constructor(private readonly deps: LearningEventServiceDeps) {}

  /**
   * Validate and append one event. Returns the stored evidence. Refuses any
   * malformed request with a typed, safe domain error BEFORE touching the
   * repository.
   */
  async record(input: AppendLearningEventInput): Promise<StoredLearningEvent> {
    const event = makeLearningEvent(input);
    return this.deps.repository.append(event);
  }

  /**
   * Read the actor's events in DETERMINISTIC order (occurredAt, then stable
   * id), bounded to `limit` (≤ {@link MAX_LIST_LIMIT}). Read-only.
   */
  async listByActor(actorPublicId: string, limit: number): Promise<StoredLearningEvent[]> {
    const bounded = Math.max(0, Math.min(limit, MAX_LIST_LIMIT));
    const events = await this.deps.repository.listByActor(actorPublicId, bounded);
    return orderEvents(events);
  }
}
