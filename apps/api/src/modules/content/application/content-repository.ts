/**
 * Content repository port (CP-01).
 *
 * Persistence-agnostic port the content application service depends on. It
 * exposes ONLY the reads/writes CP-01 needs — hierarchy nodes, reusable learning
 * items and lesson<->item associations. There is deliberately no exercise/
 * evaluation/learning-event/mastery surface (those are later checkpoints).
 *
 * All methods return persistence-agnostic views whose only external identifier
 * is `publicId` (never the internal surrogate id).
 */
import { type ContentVisibility, type LearningItemKind } from '../domain';

/** A persisted hierarchy node (course/unit/lesson share this shape). */
export interface StoredNode {
  readonly publicId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: ContentVisibility;
  readonly position: number;
  readonly authorId: string;
}

/** A persisted reusable learning item. */
export interface StoredItem {
  readonly publicId: string;
  readonly kind: LearningItemKind;
  readonly simplified: string | null;
  readonly traditional: string | null;
  readonly pinyin: string | null;
  readonly meaning: string | null;
  readonly hskLevel: number | null;
  readonly reference: Record<string, unknown> | null;
  readonly authorId: string;
}

/** A lesson's association to a learning item, with its order. */
export interface StoredLessonItem {
  readonly learningItemPublicId: string;
  readonly position: number;
}

/** Create payload for a hierarchy node. */
export interface CreateNodeInput {
  readonly publicId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: ContentVisibility;
  readonly position: number;
  readonly authorId: string;
}

/** Create payload for a learning item. */
export interface CreateItemInput {
  readonly publicId: string;
  readonly kind: LearningItemKind;
  readonly simplified: string | null;
  readonly traditional: string | null;
  readonly pinyin: string | null;
  readonly meaning: string | null;
  readonly hskLevel: number | null;
  readonly reference: Record<string, unknown> | null;
  readonly authorId: string;
}

export interface ContentRepository {
  // --- courses -----------------------------------------------------------
  findCourseBySlug(slug: string): Promise<StoredNode | null>;
  findCourseByPublicId(publicId: string): Promise<StoredNode | null>;
  listCourses(): Promise<StoredNode[]>;
  createCourse(input: CreateNodeInput): Promise<StoredNode>;

  // --- units -------------------------------------------------------------
  findUnitByPublicId(publicId: string): Promise<StoredNode | null>;
  findUnitByCourseAndSlug(coursePublicId: string, slug: string): Promise<StoredNode | null>;
  listUnitsByCourse(coursePublicId: string): Promise<StoredNode[]>;
  createUnit(coursePublicId: string, input: CreateNodeInput): Promise<StoredNode>;

  // --- lessons -----------------------------------------------------------
  findLessonByPublicId(publicId: string): Promise<StoredNode | null>;
  findLessonByUnitAndSlug(unitPublicId: string, slug: string): Promise<StoredNode | null>;
  listLessonsByUnit(unitPublicId: string): Promise<StoredNode[]>;
  createLesson(unitPublicId: string, input: CreateNodeInput): Promise<StoredNode>;

  // --- learning items ----------------------------------------------------
  findItemByPublicId(publicId: string): Promise<StoredItem | null>;
  createItem(input: CreateItemInput): Promise<StoredItem>;
  listItemsByKind(kind: LearningItemKind): Promise<StoredItem[]>;
  listItemsByLesson(lessonPublicId: string): Promise<StoredLessonItem[]>;
  attachItemToLesson(lessonPublicId: string, itemPublicId: string, position: number): Promise<void>;
}
