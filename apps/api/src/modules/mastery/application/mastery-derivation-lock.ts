import { type MasteryEventReader } from './mastery-event-reader';
import { type MasteryProjectionRepository } from './mastery-projection-repository';

/** Resources bound to the same transaction that owns the actor lock. */
export interface MasteryDerivationResources {
  readonly events: MasteryEventReader;
  readonly projections: MasteryProjectionRepository;
}

/** Serializes mastery derivation for one actor across concurrent API requests. */
export interface MasteryDerivationLock {
  runExclusive<T>(
    actorPublicId: string,
    operation: (resources: MasteryDerivationResources) => Promise<T>,
  ): Promise<T>;
}
