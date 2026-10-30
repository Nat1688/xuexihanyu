/**
 * In-memory content repository fake (CP-01 test support).
 *
 * A dependency-free implementation of the {@link ContentRepository} port used by
 * unit/e2e tests so they never touch PostgreSQL. It mirrors the persistence
 * invariants the real Prisma adapter relies on (slug uniqueness within a parent
 * scope, ordered lesson items) closely enough to exercise the service and HTTP
 * layers.
 */
import {
  ContentService,
  type ContentServiceDeps,
} from '../../src/modules/content/application/content-service';
import {
  type ContentRepository,
  type CreateItemInput,
  type CreateNodeInput,
  type StoredItem,
  type StoredLessonItem,
  type StoredNode,
} from '../../src/modules/content/application/content-repository';
import { type LearningItemKind } from '../../src/modules/content/domain';

interface NodeRow extends StoredNode {
  level: 'COURSE' | 'UNIT' | 'LESSON';
  parentPublicId: string | null;
}

export class FakeContentRepository implements ContentRepository {
  private readonly nodes: NodeRow[] = [];
  private readonly items: StoredItem[] = [];
  private readonly links: Array<{ lessonPublicId: string; link: StoredLessonItem }> = [];

  async readComposition(publicId: string) {
    const lesson = await this.findLessonByPublicId(publicId);
    if (!lesson) return null;
    const links = await this.listItemsByLesson(publicId);
    const items = await Promise.all(
      [...links]
        .sort((a, b) => a.position - b.position)
        .map((link) => this.findItemByPublicId(link.learningItemPublicId)),
    );
    return { lesson, items: items.filter((item): item is StoredItem => item !== null) };
  }
  async updateCourse(input: StoredNode): Promise<void> {
    const node = this.nodes.find((row) => row.publicId === input.publicId)!;
    Object.assign(node, input);
  }
  async saveComposition(
    input: import('../../src/modules/content/application/content-repository').LessonComposition,
  ): Promise<void> {
    const node = this.nodes.find((row) => row.publicId === input.node.publicId)!;
    Object.assign(node, input.node);
    for (const item of input.items)
      if (!this.items.some((row) => row.publicId === item.publicId)) this.items.push(item);
    this.links.splice(
      0,
      this.links.length,
      ...this.links.filter((row) => row.lessonPublicId !== input.node.publicId),
    );
    input.items.forEach((item, position) =>
      this.links.push({
        lessonPublicId: input.node.publicId,
        link: { learningItemPublicId: item.publicId, position },
      }),
    );
  }

  private mk(
    level: NodeRow['level'],
    input: CreateNodeInput,
    parentPublicId: string | null,
  ): NodeRow {
    const row: NodeRow = {
      ...input,
      level,
      parentPublicId,
    };
    this.nodes.push(row);
    return row;
  }

  async findCourseBySlug(slug: string): Promise<StoredNode | null> {
    return this.nodes.find((n) => n.level === 'COURSE' && n.slug === slug) ?? null;
  }
  async findCourseByPublicId(publicId: string): Promise<StoredNode | null> {
    return this.nodes.find((n) => n.level === 'COURSE' && n.publicId === publicId) ?? null;
  }
  async listCourses(): Promise<StoredNode[]> {
    return this.nodes.filter((n) => n.level === 'COURSE');
  }
  async createCourse(input: CreateNodeInput): Promise<StoredNode> {
    return this.mk('COURSE', input, null);
  }

  async findUnitByPublicId(publicId: string): Promise<StoredNode | null> {
    return this.nodes.find((n) => n.level === 'UNIT' && n.publicId === publicId) ?? null;
  }
  async findUnitByCourseAndSlug(coursePublicId: string, slug: string): Promise<StoredNode | null> {
    return (
      this.nodes.find(
        (n) => n.level === 'UNIT' && n.parentPublicId === coursePublicId && n.slug === slug,
      ) ?? null
    );
  }
  async listUnitsByCourse(coursePublicId: string): Promise<StoredNode[]> {
    return this.nodes.filter((n) => n.level === 'UNIT' && n.parentPublicId === coursePublicId);
  }
  async createUnit(coursePublicId: string, input: CreateNodeInput): Promise<StoredNode> {
    return this.mk('UNIT', input, coursePublicId);
  }

  async findLessonByPublicId(publicId: string): Promise<StoredNode | null> {
    return this.nodes.find((n) => n.level === 'LESSON' && n.publicId === publicId) ?? null;
  }
  async findLessonByUnitAndSlug(unitPublicId: string, slug: string): Promise<StoredNode | null> {
    return (
      this.nodes.find(
        (n) => n.level === 'LESSON' && n.parentPublicId === unitPublicId && n.slug === slug,
      ) ?? null
    );
  }
  async listLessonsByUnit(unitPublicId: string): Promise<StoredNode[]> {
    return this.nodes.filter((n) => n.level === 'LESSON' && n.parentPublicId === unitPublicId);
  }
  async createLesson(unitPublicId: string, input: CreateNodeInput): Promise<StoredNode> {
    return this.mk('LESSON', input, unitPublicId);
  }

  async findItemByPublicId(publicId: string): Promise<StoredItem | null> {
    return this.items.find((i) => i.publicId === publicId) ?? null;
  }
  async createItem(input: CreateItemInput): Promise<StoredItem> {
    const row: StoredItem = { ...input };
    this.items.push(row);
    return row;
  }
  async listItemsByKind(kind: LearningItemKind): Promise<StoredItem[]> {
    return this.items.filter((i) => i.kind === kind);
  }
  async listItemsByLesson(lessonPublicId: string): Promise<StoredLessonItem[]> {
    return this.links.filter((l) => l.lessonPublicId === lessonPublicId).map((l) => l.link);
  }
  async attachItemToLesson(
    lessonPublicId: string,
    itemPublicId: string,
    position: number,
  ): Promise<void> {
    this.links.push({ lessonPublicId, link: { learningItemPublicId: itemPublicId, position } });
  }
}

/** Construct a ContentService over the fake with an injectable id generator. */
export function makeContentService(
  repository: ContentRepository = new FakeContentRepository(),
  newPublicId: () => string = defaultIds(),
): ContentService {
  const deps: ContentServiceDeps = { repository, newPublicId };
  return new ContentService(deps);
}

function defaultIds(): () => string {
  let n = 0;
  return () => `gen-${String(++n).padStart(4, '0')}`;
}
