/**
 * Student MVP domain policy (CP-05).
 *
 * The LOGIN -> TODAY -> CONTINUE -> EXERCISE -> RESULT -> NEXT loop is defined
 * here as small, pure, independently testable rules. Nothing in this module
 * touches persistence, HTTP, the clock or a model:
 *
 *   - {@link DEFAULT_DAILY_GOAL}          the bounded size of a Today session.
 *   - {@link SESSION_TTL_MINUTES}         how long an issued exercise stays
 *                                        presentable (bounded, deterministic).
 *   - {@link masteryRank}                 TODAY ordering rank for a mastery state.
 *   - {@link compareQueueEntries}         deterministic Today ordering
 *                                        (due-first, then mastery, then item).
 *   - {@link canAnswerSession}            who may answer, and when.
 *   - {@link nextActionFor}               RESULT -> NEXT routing
 *                                        (CONTINUE / DONE / EMPTY).
 *   - {@link isStudent}                   the role check for the student surface.
 *
 * Forbidden here (contract): teacher/class/assignment logic, analytics scoring,
 * AI hints, notifications and any cross-learner visibility.
 */
import { type Role } from '../../identity/domain/role';
import { type MasteryState } from '../../mastery/domain';

/** Upper bound on exercises issued per Today navigation (server-enforced). */
export const DEFAULT_DAILY_GOAL = 10;

/** Maximum accepted daily goal (a client may ask for less, never more). */
export const MAX_DAILY_GOAL = 20;

/** Bounded lifetime of an issued exercise session, in minutes. */
export const SESSION_TTL_MINUTES = 60;

/** Maximum number of Today queue entries returned (bounded read). */
export const MAX_TODAY_ENTRIES = 20;

/** The only role this surface serves. TEACHER/ADMIN are not students here. */
export function isStudent(roles: readonly Role[]): boolean {
  return roles.includes('STUDENT');
}

/**
 * Clamp a requested daily goal into `[1, MAX_DAILY_GOAL]`, defaulting to
 * {@link DEFAULT_DAILY_GOAL} for a missing/non-integer request. Defensive: a
 * client can only ever ask for LESS work than the ceiling.
 */
export function clampDailyGoal(requested: unknown): number {
  if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 1) {
    return DEFAULT_DAILY_GOAL;
  }
  return Math.min(requested, MAX_DAILY_GOAL);
}

/** TODAY ordering rank: lower sorts first. NEW/LEARNING are due-first. */
const MASTERY_RANK: Readonly<Record<MasteryState, number>> = {
  NEW: 0,
  LEARNING: 1,
  FAMILIAR: 2,
  MASTERED: 3,
};

export function masteryRank(state: MasteryState): number {
  return MASTERY_RANK[state];
}

/** The minimal queue entry the ordering rules need. */
export interface QueueEntry {
  /** Public id of the learning item (stable tiebreak). */
  readonly learningItemPublicId: string;
  /** Derived mastery state, or null when the learner has no projection yet. */
  readonly state: MasteryState | null;
  /** Review due instant from the projection, or null when never seen. */
  readonly dueAt: Date | null;
}

/**
 * Deterministic TODAY ordering:
 *   1. DUE FIRST — overdue before future-due before no-projection (never seen).
 *   2. Then by mastery rank (NEW -> LEARNING -> FAMILIAR -> MASTERED), so
 *      weaker material precedes mastered material.
 *   3. Then by learning-item public id (stable total order; no clock, no
 *      randomness), so two calls on the same inputs return the same list.
 */
export function compareQueueEntries(a: QueueEntry, b: QueueEntry, now: Date): number {
  const bucket = (e: QueueEntry): number => {
    if (e.dueAt === null) return 2;
    return e.dueAt.getTime() <= now.getTime() ? 0 : 1;
  };
  const ba = bucket(a);
  const bb = bucket(b);
  if (ba !== bb) return ba - bb;
  const rankA = masteryRank(a.state ?? 'NEW');
  const rankB = masteryRank(b.state ?? 'NEW');
  if (rankA !== rankB) return rankA - rankB;
  return a.learningItemPublicId < b.learningItemPublicId
    ? -1
    : a.learningItemPublicId > b.learningItemPublicId
      ? 1
      : 0;
}

/**
 * Order queue entries for TODAY. `now` decides which projections are DUE
 * (dueAt <= now); it is supplied by the caller — this function never reads the
 * clock. Never-seen items (no projection) sort after due and future-due items.
 */
export function orderQueue<T extends QueueEntry>(entries: readonly T[], now: Date): T[] {
  return [...entries].sort((a, b) => compareQueueEntries(a, b, now));
}

/** Owner + lifecycle of a session as seen by the answer rules. */
export interface AnswerableSession {
  /** Public id of the learner the session belongs to. */
  readonly actorPublicId: string;
  /** Expiry instant of the session. */
  readonly expiresAt: Date;
  /** Whether an effective submission already exists. */
  readonly answered: boolean;
}

/**
 * May the caller answer this session now? A session is answerable ONLY by its
 * owner, BEFORE expiry, and while it has no effective submission. Returns a
 * stable reason token on refusal (safe to surface; no identifiers echoed).
 */
export function canAnswerSession(
  session: AnswerableSession,
  callerPublicId: string,
  now: Date,
): { allowed: true } | { allowed: false; reason: 'NOT_OWNER' | 'EXPIRED' | 'ALREADY_ANSWERED' } {
  if (session.actorPublicId !== callerPublicId) return { allowed: false, reason: 'NOT_OWNER' };
  if (session.expiresAt.getTime() <= now.getTime()) return { allowed: false, reason: 'EXPIRED' };
  if (session.answered) return { allowed: false, reason: 'ALREADY_ANSWERED' };
  return { allowed: true };
}

/** What the RESULT screen offers next. */
export type NextAction = 'CONTINUE' | 'DONE' | 'EMPTY';

/**
 * RESULT -> NEXT routing. When the learner has more due/queued material the
 * next action is CONTINUE; when the queue is exhausted but the day had work it
 * is DONE; with nothing at all it is EMPTY. Pure and total.
 */
export function nextActionFor(remaining: number, completedToday: number): NextAction {
  if (remaining > 0) return 'CONTINUE';
  if (completedToday > 0) return 'DONE';
  return 'EMPTY';
}
