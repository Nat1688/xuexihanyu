/**
 * Content application service (CP-01).
 *
 * Orchestrates the teacher-managed content use-cases over the
 * {@link ContentRepository} port: author the hierarchy (course/unit/lesson),
 * author reusable Chinese learning items and associate items with lessons. It
 * owns NO HTTP or persistence detail, and it enforces the CP-01 contracts:
 *
 *   - EVERY authoring mutation is authorized server-side via
 *     {@link assertCanMutateContent}/{@link assertCanCreateContent} against the
 *     caller's CURRENT roles (TEACHER own-only; ADMIN any).
 *   - Hierarchy writes validate ordering/slug/title and reject slug collisions
 *     within the parent scope (`ContentConflictError`).
 *   - Items are validated for their Chinese kind-specific fields and never
 *     collapse into a generic term/definition.
 *   - Reads are deterministic and filtered by the server-side read policy
 *     (students see only PUBLISHED content).
 *
 * Forbidden here (CP-01): exercise generation/evaluation, learning events,
 * mastery/review, media storage/upload, import/export or AI.
 */
import {
  type ContentVisibility,
  type ContentActor,
  type LearningItemKind,
  type HierarchyNode,
  type LearningItem,
  ContentConflictError,
  ContentNotFoundError,
  assertCanCreateContent,
  assertCanMutateContent,
  canReadContent,
  filterReadable,
  makeHierarchyNode,
  makeLearningItem,
} from '../domain';

import {
  type ContentRepository,
  type StoredItem,
  type StoredNode,
  type CreateNodeInput,
} from './content-repository';

/** Dependencies for the content service. */
export interface ContentServiceDeps {
  readonly repository: ContentRepository;
  /** Fresh public id generator for authored nodes/items (deterministic in tests). */
  readonly newPublicId: () => string;
}

/** Authored input for a hierarchy node (untrusted/shape-validated in domain). */
export interface NodeDraft {
  slug: unknown;
  title: unknown;
  description?: unknown;
  visibility?: unknown;
  position?: unknown;
}

/** Authored input for a learning item. */
export interface ItemDraft {
  kind: unknown;
  simplified?: unknown;
  traditional?: unknown;
  pinyin?: unknown;
  meaning?: unknown;
  hskLevel?: unknown;
  reference?: unknown;
}

export class ContentService {
  constructor(private readonly deps: ContentServiceDeps) {}

  // --- hierarchy: courses ------------------------------------------------

  /** Author a COURSE. Requires an authoring role (TEACHER/ADMIN). */
  async createCourse(actor: ContentActor, draft: NodeDraft): Promise<HierarchyNode> {
    assertCanCreateContent(actor);
    const node = makeHierarchyNode({
      publicId: this.deps.newPublicId(),
      authorId: actor.userId,
      ...draft,
    });
    const existing = await this.deps.repository.findCourseBySlug(node.slug);
    if (existing) {
      throw new ContentConflictError(`a course with slug "${node.slug}" already exists`);
    }
    return toNode(await this.deps.repository.createCourse(toCreateInput(node)));
  }

  // --- hierarchy: units --------------------------------------------------

  /** Author a UNIT under a course. Requires an authoring role. */
  async createUnit(
    actor: ContentActor,
    coursePublicId: string,
    draft: NodeDraft,
  ): Promise<HierarchyNode> {
    assertCanCreateContent(actor);
    const course = await this.deps.repository.findCourseByPublicId(coursePublicId);
    if (!course) throw new ContentNotFoundError('course');

    const node = makeHierarchyNode({
      publicId: this.deps.newPublicId(),
      authorId: actor.userId,
      ...draft,
    });
    const existing = await this.deps.repository.findUnitByCourseAndSlug(coursePublicId, node.slug);
    if (existing) {
      throw new ContentConflictError(
        `a unit with slug "${node.slug}" already exists in this course`,
      );
    }
    return toNode(await this.deps.repository.createUnit(coursePublicId, toCreateInput(node)));
  }

  // --- hierarchy: lessons ------------------------------------------------

  /** Author a LESSON under a unit. Requires an authoring role. */
  async createLesson(
    actor: ContentActor,
    unitPublicId: string,
    draft: NodeDraft,
  ): Promise<HierarchyNode> {
    assertCanCreateContent(actor);
    const unit = await this.deps.repository.findUnitByPublicId(unitPublicId);
    if (!unit) throw new ContentNotFoundError('unit');

    const node = makeHierarchyNode({
      publicId: this.deps.newPublicId(),
      authorId: actor.userId,
      ...draft,
    });
    const existing = await this.deps.repository.findLessonByUnitAndSlug(unitPublicId, node.slug);
    if (existing) {
      throw new ContentConflictError(
        `a lesson with slug "${node.slug}" already exists in this unit`,
      );
    }
    return toNode(await this.deps.repository.createLesson(unitPublicId, toCreateInput(node)));
  }

  // --- learning items ----------------------------------------------------

  /** Author a reusable learning item. Requires an authoring role. */
  async createItem(actor: ContentActor, draft: ItemDraft): Promise<LearningItem> {
    assertCanCreateContent(actor);
    const item = makeLearningItem({
      publicId: this.deps.newPublicId(),
      authorId: actor.userId,
      ...draft,
    });
    return toItem(await this.deps.repository.createItem(toItemCreateInput(item)));
  }

  /**
   * Associate a reusable item with a lesson at an ordered position. AUTHORING
   * mutation: authorized against the LESSON's authorship (the lesson is the
   * teacher-managed content being augmented).
   */
  async attachItemToLesson(
    actor: ContentActor,
    lessonPublicId: string,
    itemPublicId: string,
    position: unknown,
  ): Promise<void> {
    const lesson = await this.deps.repository.findLessonByPublicId(lessonPublicId);
    if (!lesson) throw new ContentNotFoundError('lesson');
    assertCanMutateContent(actor, lesson.authorId);

    const item = await this.deps.repository.findItemByPublicId(itemPublicId);
    if (!item) throw new ContentNotFoundError('learning item');

    const ordered = makeHierarchyNode({
      publicId: lesson.publicId,
      authorId: lesson.authorId,
      slug: lesson.slug,
      title: lesson.title,
      position: position === undefined || position === null ? 0 : position,
    });

    await this.deps.repository.attachItemToLesson(lessonPublicId, itemPublicId, ordered.position);
  }

  // --- deterministic reads -----------------------------------------------

  /** List courses the actor may read (students: PUBLISHED only). */
  async listCourses(actor: ContentActor): Promise<HierarchyNode[]> {
    const courses = await this.deps.repository.listCourses();
    return filterReadable(courses, actor.roles).map(toNode);
  }

  /** List units of a course the actor may read, or null when the course is hidden. */
  async listUnits(actor: ContentActor, coursePublicId: string): Promise<HierarchyNode[] | null> {
    const course = await this.deps.repository.findCourseByPublicId(coursePublicId);
    if (!course) throw new ContentNotFoundError('course');
    if (!canReadContent(course.visibility, actor.roles)) return null;
    const units = await this.deps.repository.listUnitsByCourse(coursePublicId);
    return filterReadable(units, actor.roles).map(toNode);
  }

  /** List lessons of a unit the actor may read, or null when the unit is hidden. */
  async listLessons(actor: ContentActor, unitPublicId: string): Promise<HierarchyNode[] | null> {
    const unit = await this.deps.repository.findUnitByPublicId(unitPublicId);
    if (!unit) throw new ContentNotFoundError('unit');
    if (!canReadContent(unit.visibility, actor.roles)) return null;
    const lessons = await this.deps.repository.listLessonsByUnit(unitPublicId);
    return filterReadable(lessons, actor.roles).map(toNode);
  }

  /** List items of a given kind (authoring view; requires an authoring role). */
  async listItemsByKind(actor: ContentActor, kind: LearningItemKind): Promise<LearningItem[]> {
    assertCanCreateContent(actor);
    const items = await this.deps.repository.listItemsByKind(kind);
    return items.map(toItem);
  }

  /**
   * Deterministically list a lesson's associated items ordered by position.
   * A student may only read a PUBLISHED lesson.
   */
  async listLessonItems(
    actor: ContentActor,
    lessonPublicId: string,
  ): Promise<Array<{ learningItemPublicId: string; position: number }> | null> {
    const lesson = await this.deps.repository.findLessonByPublicId(lessonPublicId);
    if (!lesson) throw new ContentNotFoundError('lesson');
    if (!canReadContent(lesson.visibility, actor.roles)) return null;
    const rows = await this.deps.repository.listItemsByLesson(lessonPublicId);
    return [...rows]
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ learningItemPublicId: r.learningItemPublicId, position: r.position }));
  }
}

// --- mapping helpers -------------------------------------------------------

function toCreateInput(node: HierarchyNode): CreateNodeInput {
  return {
    publicId: node.publicId,
    slug: node.slug,
    title: node.title,
    description: node.description,
    visibility: node.visibility,
    position: node.position,
    authorId: node.authorId,
  };
}

function toItemCreateInput(item: LearningItem): Parameters<ContentRepository['createItem']>[0] {
  return {
    publicId: item.publicId,
    kind: item.kind,
    simplified: item.simplified,
    traditional: item.traditional,
    pinyin: item.pinyin,
    meaning: item.meaning,
    hskLevel: item.hskLevel,
    reference: item.reference,
    authorId: item.authorId,
  };
}

function toNode(stored: StoredNode): HierarchyNode {
  return Object.freeze({
    publicId: stored.publicId,
    slug: stored.slug,
    title: stored.title,
    description: stored.description,
    visibility: stored.visibility as ContentVisibility,
    position: stored.position,
    authorId: stored.authorId,
  });
}

function toItem(stored: StoredItem): LearningItem {
  return Object.freeze({
    publicId: stored.publicId,
    kind: stored.kind,
    simplified: stored.simplified,
    traditional: stored.traditional,
    pinyin: stored.pinyin,
    meaning: stored.meaning,
    hskLevel: stored.hskLevel,
    reference: stored.reference,
    authorId: stored.authorId,
  });
}
