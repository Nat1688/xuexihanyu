/**
 * Exercise generator/evaluator ports (CP-02).
 *
 * The exercise application service depends on a NARROW read port that surfaces
 * APPROVED content only — never the full content authoring surface. This keeps
 * the exercise boundary provider-neutral and forbids the generator from
 * inventing or mutating content.
 *
 * "Approved content" for CP-02 means content a learner may read (a PUBLISHED
 * lesson and its associated items). The port is deliberately read-only: CP-02
 * stores NOTHING (no exercise sessions, no attempts, no events).
 */
import { type ExerciseMode, type ExerciseFormat, type ExerciseInstance } from '../domain';

/** A source learning item as seen by the exercise engine (read-only view). */
export interface ExerciseSourceItem {
  readonly learningItemPublicId: string;
  readonly simplified: string | null;
  readonly pinyin: string | null;
  readonly meaning: string | null;
}

/**
 * Read port over approved content. Implementations must return ONLY content a
 * learner is allowed to see (PUBLISHED lessons and their associated items) and
 * must be deterministic (stable ordering).
 */
export interface ExerciseContentReader {
  /** List the item public ids attached to a readable lesson, in position order. */
  listApprovedItemIds(lessonPublicId: string): Promise<string[] | null>;
  /** Fetch a single approved source item, or null when unavailable/unreadable. */
  getApprovedItem(learningItemPublicId: string): Promise<ExerciseSourceItem | null>;
}

/** A request to generate a batch of exercises for a lesson. */
export interface GenerateRequest {
  /** Lesson whose approved items seed the exercises. */
  readonly lessonPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  /** Maximum number of exercises to generate (best-effort). */
  readonly limit: number;
  /** How many distractors per multiple-choice exercise (best-effort). */
  readonly distractors?: number;
  /** Stable seed for deterministic distractor ordering. */
  readonly seed?: string;
}

/** A batch of generated, server-side exercise instances. */
export interface ExerciseBatch {
  readonly lessonPublicId: string;
  readonly mode: ExerciseMode;
  readonly format: ExerciseFormat;
  readonly instances: readonly ExerciseInstance[];
}
