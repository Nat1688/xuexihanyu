/**
 * Mastery projection contract + deterministic reducer (CP-04).
 *
 * A {@link MasteryProjection} is DERIVED state for a single (user, learning
 * item) pair, computed PURELY from that pair's ordered CP-03 event evidence
 * under a fixed rule version. It is REPLACEABLE: the projection table can be
 * dropped and rebuilt from immutable events at any time, and an incremental
 * derivation must equal a full rebuild. Events are NEVER read for mutation and
 * NEVER written here.
 *
 * The reducer (`deriveProjection` / `applyEvent`) is the single, pure,
 * clock-free place where a mastery state transitions and a review date is
 * scheduled. Same ordered evidence + same rule version ⇒ byte-identical
 * projection (modulo the explicitly stamped recompute timestamp, which the
 * caller supplies).
 *
 * TRANSITION RULES (rule version 1) — deterministic functions of evidence:
 *
 *   * Only events carrying a learning-item reference are keyed to a projection;
 *     events without one are ignored (not keyed), never an error at the batch
 *     level.
 *   * The projection only ADVANCES on positive evidence and is monotone within
 *     a derivation (a later event never lowers the state below a prior higher
 *     state), except that a lapse is recorded for scheduling. This keeps
 *     rebuild == incremental reproducible.
 *
 *   Evidence → transition (given current state S and running counters):
 *
 *   - ANSWER_SUBMITTED with outcome "correct":
 *       consecutiveCorrect += 1.
 *       NEW      → LEARNING   (first correct answer)
 *       LEARNING → FAMILIAR    when consecutiveCorrect reaches FAMILIAR_THRESHOLD
 *       FAMILIAR → MASTERED    when consecutiveCorrect reaches MASTERED_THRESHOLD
 *       MASTERED → MASTERED.
 *   - ANSWER_SUBMITTED with outcome "incorrect" (a lapse):
 *       consecutiveCorrect resets to 0; state is NOT lowered in rule v1
 *       (a lapse only affects scheduling: MASTERED reviews sooner). This keeps
 *       the state function monotone and rebuild-stable.
 *   - EXERCISE_COMPLETED: counts as engagement evidence; a NEW item becomes
 *       LEARNING (the learner engaged) but it does not by itself promote to
 *       FAMILIAR/MASTERED and does not reset the correct streak.
 *   - REVIEW_ACTIVITY: records that a review happened; it refreshes the
 *       schedule anchor but never changes the state by itself.
 *   - LESSON_STARTED / LESSON_COMPLETED / EXERCISE_PRESENTED: contextual
 *       evidence only; they move the schedule anchor but do not change state
 *       and do not affect the correct streak.
 *
 *   Outcomes are read from the allow-listed event metadata `outcome` token
 *   (CP-02 normalized evidence) — never from raw answers.
 *
 * THRESHOLDS (rule version 1): FAMILIAR at 2 consecutive correct, MASTERED at 4.
 */
import { type MasteryState } from './mastery-state';
import { computeDueAt } from './review-schedule';
import { CURRENT_RULE_VERSION, validateRuleVersion } from './mastery-rule-version';
import { MasteryUnkeyableEventError, MasteryValidationError } from './mastery-errors';

/** Consecutive correct answers required to reach FAMILIAR (rule v1). */
export const FAMILIAR_THRESHOLD = 2;

/** Consecutive correct answers required to reach MASTERED (rule v1). */
export const MASTERED_THRESHOLD = 4;

/** The normalized outcome token that counts as a lapse (from CP-03 metadata). */
export const LAPSE_OUTCOME = 'incorrect';

/**
 * A derived mastery projection for one (user, learning item) pair. All fields
 * are derived; none is authoritative evidence. Frozen on build.
 */
export interface MasteryProjection {
  /** Acting user's public id (from the event evidence). */
  readonly actorPublicId: string;
  /** Learning-item public id this projection is keyed by. */
  readonly learningItemPublicId: string;
  /** Derived mastery state. */
  readonly state: MasteryState;
  /** Derived review due-at instant (UTC). */
  readonly dueAt: Date;
  /** Rule version this projection was derived under. */
  readonly ruleVersion: number;
  /**
   * Source-event cursor: the instant of the latest event in the ordered source
   * set. It is an audit marker, not a safe filtering watermark: delayed events
   * may be appended later with an earlier historical timestamp.
   */
  readonly lastEventAt: Date | null;
  /** The public id of the latest event folded in (stable tiebreak for cursors). */
  readonly lastEventPublicId: string | null;
  /** Running consecutive-correct counter (rule input, exposed for auditability). */
  readonly consecutiveCorrect: number;
  /** Whether the latest folded evidence was a lapse (drives schedule step-down). */
  readonly latestOutcomeLapsed: boolean;
  /** Server recompute instant (caller-supplied; never read from the clock here). */
  readonly recomputedAt: Date;
}

/** Minimum event evidence the reducer needs (a view of {@link StoredLearningEvent}). */
export interface MasteryEvidenceEvent {
  readonly publicId: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly refs: { readonly learningItemPublicId?: string | null };
  readonly metadata: { readonly outcome?: string | number | boolean };
}

/** Is the event's normalized outcome a lapse? Reads the allow-listed token only. */
export function isLapse(event: MasteryEvidenceEvent): boolean {
  return event.metadata.outcome === LAPSE_OUTCOME;
}

/** Is the event a correct answer submission (positive grading evidence)? */
function isCorrectAnswer(event: MasteryEvidenceEvent): boolean {
  return event.type === 'ANSWER_SUBMITTED' && event.metadata.outcome === 'correct';
}

/**
 * Initial (empty-evidence) projection inputs for an item. A pair with no
 * evidence is conceptually `NEW`; the service only materializes rows for pairs
 * that have at least one keyed event.
 */
export function initialProjection(
  actorPublicId: string,
  learningItemPublicId: string,
  ruleVersion: number = CURRENT_RULE_VERSION,
): MasteryProjection {
  const version = validateRuleVersion(ruleVersion);
  return buildProjection({
    actorPublicId,
    learningItemPublicId,
    state: 'NEW',
    consecutiveCorrect: 0,
    latestOutcomeLapsed: false,
    lastEventAt: null,
    lastEventPublicId: null,
    recomputedAt: EPOCH,
    ruleVersion: version,
  });
}

const EPOCH = new Date(0);

interface BuildInput {
  actorPublicId: string;
  learningItemPublicId: string;
  state: MasteryState;
  consecutiveCorrect: number;
  latestOutcomeLapsed: boolean;
  lastEventAt: Date | null;
  lastEventPublicId: string | null;
  recomputedAt: Date;
  ruleVersion: number;
}

/** Assemble a frozen projection, deriving `dueAt` from the state + anchor. */
function buildProjection(input: BuildInput): MasteryProjection {
  const anchor = input.lastEventAt ?? input.recomputedAt;
  const dueAt = computeDueAt({
    state: input.state,
    asOf: anchor,
    latestOutcomeLapsed: input.latestOutcomeLapsed,
  });
  return Object.freeze({
    actorPublicId: input.actorPublicId,
    learningItemPublicId: input.learningItemPublicId,
    state: input.state,
    dueAt,
    ruleVersion: input.ruleVersion,
    lastEventAt: input.lastEventAt,
    lastEventPublicId: input.lastEventPublicId,
    consecutiveCorrect: input.consecutiveCorrect,
    latestOutcomeLapsed: input.latestOutcomeLapsed,
    recomputedAt: input.recomputedAt,
  });
}

/** The mutable running accumulator used while folding evidence. */
interface FoldState {
  state: MasteryState;
  consecutiveCorrect: number;
  latestOutcomeLapsed: boolean;
  lastEventAt: Date | null;
  lastEventPublicId: string | null;
}

/** Apply the deterministic transition for one event to the running state. */
function transition(s: FoldState, event: MasteryEvidenceEvent): FoldState {
  let state = s.state;
  let consecutiveCorrect = s.consecutiveCorrect;
  let latestOutcomeLapsed = s.latestOutcomeLapsed;

  if (event.type === 'ANSWER_SUBMITTED') {
    if (isCorrectAnswer(event)) {
      consecutiveCorrect += 1;
      latestOutcomeLapsed = false;
      if (state === 'NEW') {
        state = 'LEARNING';
      } else if (state === 'LEARNING' && consecutiveCorrect >= FAMILIAR_THRESHOLD) {
        state = 'FAMILIAR';
      } else if (state === 'FAMILIAR' && consecutiveCorrect >= MASTERED_THRESHOLD) {
        state = 'MASTERED';
      }
    } else if (isLapse(event)) {
      consecutiveCorrect = 0;
      latestOutcomeLapsed = true;
      // State is NOT lowered in rule v1 (a lapse affects scheduling only).
    }
  } else if (event.type === 'EXERCISE_COMPLETED') {
    // Engagement evidence: a NEW item advances to LEARNING; never resets streak.
    if (state === 'NEW') state = 'LEARNING';
  }

  return {
    state,
    consecutiveCorrect,
    latestOutcomeLapsed,
    // The anchor always advances to the latest folded event instant.
    lastEventAt: event.occurredAt,
    lastEventPublicId: event.publicId,
  };
}

/**
 * Fold ONE keyed evidence event onto an existing projection, returning a NEW
 * frozen projection. Pure: the input projection and event are not mutated.
 * Throws {@link MasteryUnkeyableEventError} if the event has no learning-item
 * reference, or a mismatch between the event's actor/item and the projection.
 */
export function applyEvent(
  projection: MasteryProjection,
  event: MasteryEvidenceEvent,
  recomputedAt: Date,
): MasteryProjection {
  const itemPublicId = event.refs.learningItemPublicId ?? null;
  if (!itemPublicId) {
    throw new MasteryUnkeyableEventError(event.type);
  }
  if (itemPublicId !== projection.learningItemPublicId) {
    throw new MasteryValidationError('learningItemPublicId', 'does not match the projection');
  }

  const next = transition(
    {
      state: projection.state,
      consecutiveCorrect: projection.consecutiveCorrect,
      latestOutcomeLapsed: projection.latestOutcomeLapsed,
      lastEventAt: projection.lastEventAt,
      lastEventPublicId: projection.lastEventPublicId,
    },
    event,
  );

  return buildProjection({
    actorPublicId: projection.actorPublicId,
    learningItemPublicId: projection.learningItemPublicId,
    state: next.state,
    consecutiveCorrect: next.consecutiveCorrect,
    latestOutcomeLapsed: next.latestOutcomeLapsed,
    lastEventAt: next.lastEventAt,
    lastEventPublicId: next.lastEventPublicId,
    recomputedAt,
    ruleVersion: projection.ruleVersion,
  });
}

/** Is the event keyed to a learning item (i.e. does it contribute to mastery)? */
export function isKeyedEvent(event: MasteryEvidenceEvent): boolean {
  return Boolean(event.refs.learningItemPublicId);
}

/**
 * Derive a projection for one (actor, item) pair from that pair's ordered
 * events. Order is applied as given (the caller supplies a deterministic,
 * `(occurredAt, publicId)`-ordered list). Pure; `recomputedAt` is stamped.
 */
export function deriveProjection(
  actorPublicId: string,
  learningItemPublicId: string,
  orderedEvents: readonly MasteryEvidenceEvent[],
  recomputedAt: Date,
  ruleVersion: number = CURRENT_RULE_VERSION,
): MasteryProjection {
  const version = validateRuleVersion(ruleVersion);
  let projection = initialProjection(actorPublicId, learningItemPublicId, version);
  for (const event of orderedEvents) {
    if (event.refs.learningItemPublicId !== learningItemPublicId) continue;
    projection = applyEvent(projection, event, recomputedAt);
  }
  // Re-stamp the recompute time on the final result (buildProjection used EPOCH
  // through the intermediate steps when there were no events).
  return withRecomputedAt(projection, recomputedAt);
}

/** Return a copy of `projection` with a new `recomputedAt` (used by rebuild). */
export function withRecomputedAt(
  projection: MasteryProjection,
  recomputedAt: Date,
): MasteryProjection {
  return buildProjection({
    actorPublicId: projection.actorPublicId,
    learningItemPublicId: projection.learningItemPublicId,
    state: projection.state,
    consecutiveCorrect: projection.consecutiveCorrect,
    latestOutcomeLapsed: projection.latestOutcomeLapsed,
    lastEventAt: projection.lastEventAt,
    lastEventPublicId: projection.lastEventPublicId,
    recomputedAt,
    ruleVersion: projection.ruleVersion,
  });
}

/**
 * Group keyed events by (actor, item), preserving input order WITHIN each
 * group. Events without a learning-item reference are excluded (they are not
 * keyable to mastery). Pure; returns a deterministic Map keyed by
 * `actor\u0000item`.
 */
export function groupKeyedEvents(
  events: readonly MasteryEvidenceEvent[],
): Map<
  string,
  { actorPublicId: string; learningItemPublicId: string; events: MasteryEvidenceEvent[] }
> {
  const groups = new Map<
    string,
    { actorPublicId: string; learningItemPublicId: string; events: MasteryEvidenceEvent[] }
  >();
  for (const event of events) {
    const itemPublicId = event.refs.learningItemPublicId ?? null;
    if (!itemPublicId) continue;
    const key = `${eventActor(event)}\u0000${itemPublicId}`;
    let group = groups.get(key);
    if (!group) {
      group = { actorPublicId: eventActor(event), learningItemPublicId: itemPublicId, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  }
  return groups;
}

/**
 * The reducer reads the acting user from evidence. CP-03 events carry the actor
 * on the record; the view exposes it (see {@link masteryEventActor}).
 */
function eventActor(event: MasteryEvidenceEvent): string {
  const actor = (event as { actorPublicId?: unknown }).actorPublicId;
  if (typeof actor !== 'string' || actor.length === 0) {
    throw new MasteryValidationError('actorPublicId', 'is required on keyed evidence');
  }
  return actor;
}
