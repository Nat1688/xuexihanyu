/**
 * CP-01 ContentService unit tests (no Nest, no DB).
 *
 * Exercises the application service over an in-memory {@link ContentRepository}
 * fake to prove:
 *   - authoring mutations are authorized (role + ownership) at the service
 *     layer, not merely in the HTTP guard;
 *   - slug collisions within the parent scope are rejected (ContentConflict);
 *   - missing parents are rejected (ContentNotFound);
 *   - reads are visibility-filtered server-side for students;
 *   - lesson items are returned in deterministic (position) order.
 */
import {
  ContentService,
  type ItemDraft,
  type NodeDraft,
} from '../../src/modules/content/application/content-service';
import {
  type ContentRepository,
  type CreateItemInput,
  type CreateNodeInput,
  type StoredItem,
  type StoredLessonItem,
  type StoredNode,
} from '../../src/modules/content/application/content-repository';
import {
  type ContentActor,
  ContentConflictError,
  ContentNotFoundError,
  type ContentVisibility,
  type LearningItemKind,
} from '../../src/modules/content/domain';
import { ForbiddenError } from '../../src/modules/identity/application/auth-errors';
import { type Role } from '../../src/modules/identity/domain';

interface NodeRow extends StoredNode {
  parentPublicId: string | null;
  level: 'COURSE' | 'UNIT' | 'LESSON';
}
type ItemRow = StoredItem;

class FakeRepository implements ContentRepository {
  readonly nodes: NodeRow[] = [];
  readonly items: ItemRow[] = [];

  private mk(
    level: NodeRow['level'],
    input: CreateNodeInput,
    parentPublicId: string | null,
  ): NodeRow {
    const row: NodeRow = {
      publicId: input.publicId,
      slug: input.slug,
      title: input.title,
      description: input.description,
      visibility: input.visibility,
      position: input.position,
      authorId: input.authorId,
      parentPublicId,
      level,
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
    const row: ItemRow = { ...input };
    this.items.push(row);
    return row;
  }
  async listItemsByKind(kind: LearningItemKind): Promise<StoredItem[]> {
    return this.items.filter((i) => i.kind === kind);
  }
  async listItemsByLesson(lessonPublicId: string): Promise<StoredLessonItem[]> {
    // Links are stored in the association list, keyed by lesson public id.
    return this.links.filter((l) => l.lessonPublicId === lessonPublicId).map((l) => l.link);
  }
  async attachItemToLesson(
    lessonPublicId: string,
    itemPublicId: string,
    position: number,
  ): Promise<void> {
    this.links.push({ lessonPublicId, link: { learningItemPublicId: itemPublicId, position } });
  }

  readonly links: Array<{ lessonPublicId: string; link: StoredLessonItem }> = [];
}

let seq = 0;
function fixedIds(): () => string {
  return () => `gen-${String(++seq).padStart(4, '0')}`;
}

function actor(userId: string, roles: Role[]): ContentActor {
  return { userId, roles };
}

const TEACHER = actor('teacher-1', ['TEACHER']);
const OTHER_TEACHER = actor('teacher-2', ['TEACHER']);
const ADMIN = actor('admin-1', ['ADMIN']);
const STUDENT = actor('student-1', ['STUDENT']);

function courseDraft(overrides: Partial<NodeDraft> = {}): NodeDraft {
  return { slug: 'greetings', title: 'Greetings', ...overrides };
}

describe('ContentService — hierarchy authoring + authorization', () => {
  let repo: FakeRepository;
  let service: ContentService;

  beforeEach(() => {
    seq = 0;
    repo = new FakeRepository();
    service = new ContentService({ repository: repo, newPublicId: fixedIds() });
  });

  it('a TEACHER can author a course and the author is recorded', async () => {
    const course = await service.createCourse(TEACHER, courseDraft());
    expect(course.slug).toBe('greetings');
    expect(course.authorId).toBe('teacher-1');
    expect(course.visibility).toBe('DRAFT');
  });

  it('a STUDENT is refused authoring a course (403)', async () => {
    await expect(service.createCourse(STUDENT, courseDraft())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('all creates ignore spoofed server fields and parent relationships', async () => {
    const spoof = {
      authorId: 'attacker',
      publicId: 'forged-id',
      id: 'internal-id',
      courseId: 'foreign-course',
      unitId: 'foreign-unit',
      parentPublicId: 'foreign-parent',
      course: { connect: { id: 'foreign-course' } },
      unit: { connect: { id: 'foreign-unit' } },
    };
    const draft = { ...courseDraft(), ...spoof, description: 'Allowed description', position: 3 };
    const course = await service.createCourse(TEACHER, draft);
    const unit = await service.createUnit(ADMIN, course.publicId, draft);
    const lesson = await service.createLesson(ADMIN, unit.publicId, draft);
    const item = await service.createItem(TEACHER, {
      ...spoof,
      kind: 'CHARACTER',
      simplified: '一',
      pinyin: 'yī',
      meaning: 'one',
    });
    for (const node of [course, unit, lesson, item]) {
      expect(node.authorId).toBe(TEACHER.userId);
      expect(node.publicId).toMatch(/^gen-/);
      expect(node).not.toHaveProperty('id');
      expect(node).not.toHaveProperty('courseId');
    }
    expect(repo.nodes.find((n) => n.publicId === unit.publicId)?.parentPublicId).toBe(
      course.publicId,
    );
    expect(repo.nodes.find((n) => n.publicId === lesson.publicId)?.parentPublicId).toBe(
      unit.publicId,
    );
    for (const node of [course, unit, lesson]) {
      expect(node.title).toBe('Greetings');
      expect(node.description).toBe('Allowed description');
      expect(node.position).toBe(3);
    }
  });

  it('rejects a duplicate course slug (conflict)', async () => {
    await service.createCourse(TEACHER, courseDraft());
    await expect(service.createCourse(TEACHER, courseDraft())).rejects.toBeInstanceOf(
      ContentConflictError,
    );
  });

  it('rejects a unit under a missing course (not found)', async () => {
    await expect(service.createUnit(TEACHER, 'nope', courseDraft())).rejects.toBeInstanceOf(
      ContentNotFoundError,
    );
  });

  it('nests units under a course and lessons under a unit', async () => {
    const course = await service.createCourse(TEACHER, courseDraft());
    const unit = await service.createUnit(TEACHER, course.publicId, {
      slug: 'u1',
      title: 'Unit 1',
    });
    const lesson = await service.createLesson(TEACHER, unit.publicId, {
      slug: 'l1',
      title: 'Lesson 1',
    });
    expect(lesson.publicId).toBeDefined();
    expect(await repo.listLessonsByUnit(unit.publicId)).toHaveLength(1);
  });

  it.each(['createUnit', 'createLesson'] as const)(
    '%s rejects foreign ownership before repository write and preserves owner/admin access',
    async (method) => {
      const course = await service.createCourse(TEACHER, courseDraft());
      const parent =
        method === 'createUnit'
          ? course
          : await service.createUnit(TEACHER, course.publicId, { slug: 'parent', title: 'Parent' });
      const write = jest.spyOn(repo, method);
      await expect(
        service[method](OTHER_TEACHER, parent.publicId, courseDraft()),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(write).not.toHaveBeenCalled();
      await expect(
        service[method](TEACHER, 'missing-parent', courseDraft()),
      ).rejects.toBeInstanceOf(ContentNotFoundError);
      expect(write).not.toHaveBeenCalled();
      const owned = await service[method](TEACHER, parent.publicId, courseDraft());
      expect(owned.authorId).toBe(TEACHER.userId);
      const adminCreated = await service[method](
        ADMIN,
        parent.publicId,
        courseDraft({ slug: 'admin-child' }),
      );
      expect(adminCreated.authorId).toBe(TEACHER.userId);
      expect(write).toHaveBeenCalledTimes(2);
      expect(adminCreated.visibility).toBe('DRAFT');
    },
  );

  it('rejects a duplicate unit slug within the SAME course', async () => {
    const course = await service.createCourse(TEACHER, courseDraft());
    await service.createUnit(TEACHER, course.publicId, { slug: 'u1', title: 'Unit 1' });
    await expect(
      service.createUnit(TEACHER, course.publicId, { slug: 'u1', title: 'Unit 1 again' }),
    ).rejects.toBeInstanceOf(ContentConflictError);
  });
});

describe('ContentService — lesson/item association authorization', () => {
  let repo: FakeRepository;
  let service: ContentService;

  beforeEach(() => {
    seq = 0;
    repo = new FakeRepository();
    service = new ContentService({ repository: repo, newPublicId: fixedIds() });
  });

  async function seedLesson(authoredBy: ContentActor): Promise<{ course: string; lesson: string }> {
    const course = await service.createCourse(authoredBy, courseDraft());
    const unit = await service.createUnit(authoredBy, course.publicId, { slug: 'u1', title: 'U1' });
    const lesson = await service.createLesson(authoredBy, unit.publicId, {
      slug: 'l1',
      title: 'L1',
    });
    return { course: course.publicId, lesson: lesson.publicId };
  }

  const vocabItem: ItemDraft = {
    kind: 'VOCABULARY',
    simplified: '你好',
    pinyin: 'nǐ hǎo',
    meaning: 'hello',
  };

  it('the authoring teacher may attach an item to their own lesson', async () => {
    const { lesson } = await seedLesson(TEACHER);
    const item = await service.createItem(TEACHER, vocabItem);
    await expect(
      service.attachItemToLesson(TEACHER, lesson, item.publicId, 0),
    ).resolves.toBeUndefined();
  });

  it('a DIFFERENT teacher may not attach to a lesson they do not own (403)', async () => {
    const { lesson } = await seedLesson(TEACHER);
    const item = await service.createItem(TEACHER, vocabItem);
    await expect(
      service.attachItemToLesson(OTHER_TEACHER, lesson, item.publicId, 0),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('an ADMIN may attach to any lesson', async () => {
    const { lesson } = await seedLesson(TEACHER);
    const item = await service.createItem(TEACHER, vocabItem);
    await expect(
      service.attachItemToLesson(ADMIN, lesson, item.publicId, 0),
    ).resolves.toBeUndefined();
  });
});

describe('ContentService — deterministic reads + visibility', () => {
  let repo: FakeRepository;
  let service: ContentService;

  beforeEach(() => {
    seq = 0;
    repo = new FakeRepository();
    service = new ContentService({ repository: repo, newPublicId: fixedIds() });
  });

  it('students see only PUBLISHED courses', async () => {
    await service.createCourse(TEACHER, courseDraft({ slug: 'draft', title: 'Draft' }));
    await service.createCourse(
      TEACHER,
      courseDraft({ slug: 'live', title: 'Live', visibility: 'PUBLISHED' as ContentVisibility }),
    );
    const forStudent = await service.listCourses(STUDENT);
    expect(forStudent.map((c) => c.slug)).toEqual(['live']);
    const forTeacher = await service.listCourses(TEACHER);
    expect(forTeacher.map((c) => c.slug).sort()).toEqual(['draft', 'live']);
  });

  it('hides a DRAFT course subtree from students (null)', async () => {
    const course = await service.createCourse(TEACHER, courseDraft());
    await expect(service.listUnits(STUDENT, course.publicId)).resolves.toBeNull();
  });

  it('returns lesson items in deterministic position order', async () => {
    const course = await service.createCourse(TEACHER, courseDraft());
    const unit = await service.createUnit(TEACHER, course.publicId, { slug: 'u1', title: 'U1' });
    const lesson = await service.createLesson(TEACHER, unit.publicId, {
      slug: 'l1',
      title: 'L1',
      visibility: 'PUBLISHED' as ContentVisibility,
    });
    const a = await service.createItem(TEACHER, {
      kind: 'VOCABULARY',
      simplified: '一',
      pinyin: 'yī',
      meaning: 'one',
    });
    const b = await service.createItem(TEACHER, {
      kind: 'VOCABULARY',
      simplified: '二',
      pinyin: 'èr',
      meaning: 'two',
    });
    await service.attachItemToLesson(TEACHER, lesson.publicId, a.publicId, 1);
    await service.attachItemToLesson(TEACHER, lesson.publicId, b.publicId, 0);

    const rows = await service.listLessonItems(STUDENT, lesson.publicId);
    expect(rows!.map((r) => r.position)).toEqual([0, 1]);
    expect(rows!.map((r) => r.learningItemPublicId)).toEqual([b.publicId, a.publicId]);
  });
});
