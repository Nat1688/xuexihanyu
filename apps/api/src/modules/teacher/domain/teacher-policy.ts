/**
 * Teacher MVP domain policy (CP-06) — pure rules, no I/O, no clock.
 *
 * Everything a teacher surface may decide is expressed here as small pure
 * functions so cross-teacher/cross-class authorization can be proven by unit
 * tests as well as over HTTP:
 *
 *   - {@link isTeacherViewer}        who may use teacher routes at all.
 *   - {@link isAdmin} / {@link isOwner}  the bounded ADMIN visibility rule.
 *   - {@link canReadClass}           class visibility (object level).
 *   - {@link canReadStudent}         roster/student-detail visibility.
 *   - {@link canReadEvidence}        progress evidence visibility.
 *   - {@link canWriteNote}           note ownership (author) rule.
 *   - {@link validateNoteBody}       note text bounds + content rules.
 *   - {@link normaliseNoteTitle}     bounded optional title.
 *   - {@link boundedWindow}          evidence window clamp (max 366 days).
 *   - {@link evidenceWindow}         half-open [from, to) window construction.
 *   - {@link isPublicId}             defensive id shape check.
 *
 * Forbidden here (contract): AI summaries/recommendations, high-stakes
 * grading, proctoring, global student search, notifications, marketplace.
 */
import { type Role } from '../../identity/domain/role';

/** Maximum enrollment/roster rows returned in one read (bounded). */
export const MAX_CLASSES = 50;

/** Maximum roster/assignment rows returned in one read (bounded). */
export const MAX_ROSTER = 200;

/** Maximum weak items in a progress summary. */
export const MAX_WEAK_ITEMS = 10;

/** Maximum evidence windows (days) a teacher may request in progress. */
export const DEFAULT_WINDOW_DAYS = 30;

/** Hard ceiling on the evidence window, in days (informational only). */
export const MAX_WINDOW_DAYS = 366;

/** Bounds for a private note body (characters, not bytes). */
export const NOTE_BODY_MIN = 1;
export const NOTE_BODY_MAX = 2000;

/** Bounds for an optional private note title. */
export const NOTE_TITLE_MAX = 120;

/** Maximum recent evidence events included in a student detail view. */
export const MAX_EVIDENCE_EVENTS = 20;

/** UUID shape (defensive; the Prisma layer still parameterises all queries). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Does the caller hold the TEACHER role? (The teacher surface's primary role.) */
export function isTeacherViewer(roles: readonly Role[]): boolean {
  return roles.includes('TEACHER');
}

/** Does the caller hold the ADMIN role? */
export function isAdmin(roles: readonly Role[]): boolean {
  return roles.includes('ADMIN');
}

/** Does the caller hold a role admitted by the teacher routes? */
export function isTeacherOrAdmin(roles: readonly Role[]): boolean {
  return isTeacherViewer(roles) || isAdmin(roles);
}

/**
 * Server-derived ownership test: the resource owner id must be a non-empty
 * string equal to the caller's public id. A missing/empty owner never matches.
 */
export function isOwner(
  resourceOwnerPublicId: string | null | undefined,
  viewerPublicId: string,
): boolean {
  return typeof resourceOwnerPublicId === 'string' && resourceOwnerPublicId.length > 0
    ? resourceOwnerPublicId === viewerPublicId
    : false;
}

/**
 * Class visibility (object level). The OWNER teacher may read; an ADMIN has
 * BOUNDED operational visibility (roster + progress, never private notes).
 */
export function canReadClass(
  viewerPublicId: string,
  roles: readonly Role[],
  classOwnerPublicId: string,
): boolean {
  return isOwner(classOwnerPublicId, viewerPublicId) || isAdmin(roles);
}

/**
 * Roster/student-detail visibility. Identical rule to class visibility: the
 * roster is derived FROM the class, so anyone who may read the class may read
 * its enrolled students — and nobody else.
 */
export function canReadStudent(
  viewerPublicId: string,
  roles: readonly Role[],
  classOwnerPublicId: string,
): boolean {
  return canReadClass(viewerPublicId, roles, classOwnerPublicId);
}

/** Progress evidence inherits the class visibility rule (no separate bypass). */
export function canReadEvidence(
  viewerPublicId: string,
  roles: readonly Role[],
  classOwnerPublicId: string,
): boolean {
  return canReadClass(viewerPublicId, roles, classOwnerPublicId);
}

/**
 * Private notes are visible ONLY to their author. ADMIN operational visibility
 * is explicitly EXCLUDED from private notes (contract: "private teacher
 * notes with explicit teacher/class/student ownership").
 */
export function canReadNote(viewerPublicId: string, noteAuthorPublicId: string): boolean {
  return isOwner(noteAuthorPublicId, viewerPublicId);
}

/** A note may only be written by the acting teacher (author = caller). */
export function canWriteNote(viewerPublicId: string, noteAuthorPublicId: string): boolean {
  return canReadNote(viewerPublicId, noteAuthorPublicId);
}

/** Does `value` look like a canonical UUID public id? */
export function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Validate a note body: trimmed length within [MIN, MAX], no control chars. */
export function validateNoteBody(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TeacherNoteInvalidBodyError('note body is required');
  }
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  // Strip disallowed control characters (keep \n and \t) — no invisible payloads.
  const cleaned = trimmed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const length = [...cleaned].length;
  if (length < NOTE_BODY_MIN) throw new TeacherNoteInvalidBodyError('note body is empty');
  if (length > NOTE_BODY_MAX) throw new TeacherNoteInvalidBodyError('note body is too long');
  return cleaned;
}

/** Normalise an optional note title: trimmed, bounded, `null` when absent. */
export function normaliseNoteTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new TeacherNoteInvalidBodyError('note title is invalid');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > NOTE_TITLE_MAX) {
    throw new TeacherNoteInvalidBodyError('note title is too long');
  }
  return trimmed;
}

/** Typed body error thrown by the pure validators above. */
export class TeacherNoteInvalidBodyError extends Error {
  readonly code = 'TEACHER_INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'TeacherNoteInvalidBodyError';
  }
}

/** Clamp a requested window in days into `[1, MAX_WINDOW_DAYS]`. */
export function boundedWindow(requested: unknown): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 1) {
    return DEFAULT_WINDOW_DAYS;
  }
  return Math.min(Math.floor(requested), MAX_WINDOW_DAYS);
}

/** A half-open evidence window `[from, to)`, both UTC instants. */
export interface EvidenceWindow {
  readonly from: Date;
  readonly to: Date;
  readonly days: number;
}

/**
 * Build the evidence window ending at `now` (exclusive) and spanning `days`.
 * Deterministic: callers pass the clock, this function only does arithmetic.
 */
export function evidenceWindow(now: Date, days: number): EvidenceWindow {
  const span = boundedWindow(days);
  const to = new Date(now.getTime());
  const from = new Date(now.getTime() - span * 24 * 60 * 60 * 1000);
  return { from, to, days: span };
}

/** Select the WEAKEST items from a normalised mastery summary (pure). */
export type WeakRankInput = {
  readonly learningItemPublicId: string;
  readonly state: string;
  readonly consecutiveCorrect: number;
  readonly correctInWindow: number;
  readonly incorrectInWindow: number;
  readonly dueAt: Date | null;
};

const STATE_RANK: Readonly<Record<string, number>> = {
  NEW: 0,
  LEARNING: 1,
  FAMILIAR: 2,
  MASTERED: 3,
};

/**
 * Deterministic weak-item ordering: weakest mastery state first, then the
 * lower window accuracy, then more incorrect evidence, then due-earliest,
 * then item id. Only items with at least one window evidence or a
 * non-MASTERED state are considered weak.
 */
export function rankWeakItems(
  items: readonly WeakRankInput[],
  now: Date,
  limit: number = MAX_WEAK_ITEMS,
): WeakRankInput[] {
  const scored = items
    .map((item) => {
      const attempts = item.correctInWindow + item.incorrectInWindow;
      const accuracy = attempts === 0 ? 0 : item.correctInWindow / attempts;
      return { item, attempts, accuracy };
    })
    .filter(({ item, attempts }) => attempts > 0 || item.state !== 'MASTERED')
    .sort((a, b) => {
      const rankA = STATE_RANK[a.item.state] ?? 1;
      const rankB = STATE_RANK[b.item.state] ?? 1;
      if (rankA !== rankB) return rankA - rankB;
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      if (a.item.incorrectInWindow !== b.item.incorrectInWindow) {
        return b.item.incorrectInWindow - a.item.incorrectInWindow;
      }
      const dueA = a.item.dueAt ? a.item.dueAt.getTime() : Number.POSITIVE_INFINITY;
      const dueB = b.item.dueAt ? b.item.dueAt.getTime() : Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
      return a.item.learningItemPublicId < b.item.learningItemPublicId ? -1 : 1;
    });
  void now;
  return scored.slice(0, Math.max(0, limit)).map((s) => s.item);
}
