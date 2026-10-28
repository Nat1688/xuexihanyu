/**
 * Prisma-backed content repository (CP-01).
 *
 * Implements the {@link ContentRepository} port over the CP-01 tables:
 * `courses`, `units`, `lessons`, `learning_items` and `lesson_learning_items`.
 * It maps rows to persistence-agnostic views whose only surfaced identifier is
 * `publicId`; the internal surrogate `id` never leaves this layer.
 *
 * It does NOT implement exercise/evaluation/learning-event/mastery persistence
 * (out of CP-01 scope).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import { type ContentVisibility, type LearningItemKind } from '../domain';
import {
  type ContentRepository,
  type CreateItemInput,
  type CreateNodeInput,
  type StoredItem,
  type StoredLessonItem,
  type StoredNode,
} from '../application/content-repository';

interface NodeRow {
  publicId: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: ContentVisibility;
  position: number;
  authorId: string;
}

interface ItemRow {
  publicId: string;
  kind: LearningItemKind;
  simplified: string | null;
  traditional: string | null;
  pinyin: string | null;
  meaning: string | null;
  hskLevel: number | null;
  reference: unknown;
  authorId: string;
}

const NODE_FIELDS = {
  publicId: true,
  slug: true,
  title: true,
  description: true,
  visibility: true,
  position: true,
} as const;

const NODE_SELECT = { ...NODE_FIELDS, authorId: true } as const;
const UNIT_SELECT = { ...NODE_FIELDS, course: { select: { authorId: true } } } as const;
const LESSON_SELECT = {
  ...NODE_FIELDS,
  unit: { select: { course: { select: { authorId: true } } } },
} as const;

function toUnit(row: Omit<NodeRow, 'authorId'> & { course: { authorId: string } }): StoredNode {
  return toNode({ ...row, authorId: row.course.authorId });
}

function toLesson(
  row: Omit<NodeRow, 'authorId'> & { unit: { course: { authorId: string } } },
): StoredNode {
  return toNode({ ...row, authorId: row.unit.course.authorId });
}

// Child ownership is inherited from Course, never persisted on Unit/Lesson.
function childData(input: CreateNodeInput) {
  return {
    publicId: input.publicId,
    slug: input.slug,
    title: input.title,
    description: input.description,
    visibility: input.visibility,
    position: input.position,
  };
}

const ITEM_SELECT = {
  publicId: true,
  kind: true,
  simplified: true,
  traditional: true,
  pinyin: true,
  meaning: true,
  hskLevel: true,
  reference: true,
  authorId: true,
} as const;

function toNode(row: NodeRow): StoredNode {
  return {
    publicId: row.publicId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    position: row.position,
    authorId: row.authorId,
  };
}

function toItem(row: ItemRow): StoredItem {
  return {
    publicId: row.publicId,
    kind: row.kind,
    simplified: row.simplified,
    traditional: row.traditional,
    pinyin: row.pinyin,
    meaning: row.meaning,
    hskLevel: row.hskLevel,
    reference: (row.reference as Record<string, unknown> | null) ?? null,
    authorId: row.authorId,
  };
}

@Injectable()
export class PrismaContentRepository implements ContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- courses -----------------------------------------------------------
  async findCourseBySlug(slug: string): Promise<StoredNode | null> {
    const row = await this.prisma.course.findUnique({ where: { slug }, select: NODE_SELECT });
    return row ? toNode(row) : null;
  }

  async findCourseByPublicId(publicId: string): Promise<StoredNode | null> {
    const row = await this.prisma.course.findUnique({ where: { publicId }, select: NODE_SELECT });
    return row ? toNode(row) : null;
  }

  async listCourses(): Promise<StoredNode[]> {
    const rows = await this.prisma.course.findMany({
      select: NODE_SELECT,
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    });
    return rows.map(toNode);
  }

  async createCourse(input: CreateNodeInput): Promise<StoredNode> {
    const row = await this.prisma.course.create({ data: { ...input }, select: NODE_SELECT });
    return toNode(row);
  }
  // --- units -------------------------------------------------------------
  async findUnitByPublicId(publicId: string): Promise<StoredNode | null> {
    const row = await this.prisma.unit.findUnique({ where: { publicId }, select: UNIT_SELECT });
    return row ? toUnit(row) : null;
  }

  async findUnitByCourseAndSlug(coursePublicId: string, slug: string): Promise<StoredNode | null> {
    const course = await this.prisma.course.findUnique({
      where: { publicId: coursePublicId },
      select: { id: true },
    });
    if (!course) return null;
    const row = await this.prisma.unit.findUnique({
      where: { courseId_slug: { courseId: course.id, slug } },
      select: UNIT_SELECT,
    });
    return row ? toUnit(row) : null;
  }

  async listUnitsByCourse(coursePublicId: string): Promise<StoredNode[]> {
    const course = await this.prisma.course.findUnique({
      where: { publicId: coursePublicId },
      select: { id: true },
    });
    if (!course) return [];
    const rows = await this.prisma.unit.findMany({
      where: { courseId: course.id },
      select: UNIT_SELECT,
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    });
    return rows.map(toUnit);
  }

  async createUnit(coursePublicId: string, input: CreateNodeInput): Promise<StoredNode> {
    const course = await this.prisma.course.findUnique({
      where: { publicId: coursePublicId },
      select: { id: true },
    });
    if (!course) throw new Error('course not found');
    const row = await this.prisma.unit.create({
      data: { ...childData(input), courseId: course.id },
      select: UNIT_SELECT,
    });
    return toUnit(row);
  }

  // --- lessons -----------------------------------------------------------
  async findLessonByPublicId(publicId: string): Promise<StoredNode | null> {
    const row = await this.prisma.lesson.findUnique({ where: { publicId }, select: LESSON_SELECT });
    return row ? toLesson(row) : null;
  }

  async findLessonByUnitAndSlug(unitPublicId: string, slug: string): Promise<StoredNode | null> {
    const unit = await this.prisma.unit.findUnique({
      where: { publicId: unitPublicId },
      select: { id: true },
    });
    if (!unit) return null;
    const row = await this.prisma.lesson.findUnique({
      where: { unitId_slug: { unitId: unit.id, slug } },
      select: LESSON_SELECT,
    });
    return row ? toLesson(row) : null;
  }

  async listLessonsByUnit(unitPublicId: string): Promise<StoredNode[]> {
    const unit = await this.prisma.unit.findUnique({
      where: { publicId: unitPublicId },
      select: { id: true },
    });
    if (!unit) return [];
    const rows = await this.prisma.lesson.findMany({
      where: { unitId: unit.id },
      select: LESSON_SELECT,
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    });
    return rows.map(toLesson);
  }

  async createLesson(unitPublicId: string, input: CreateNodeInput): Promise<StoredNode> {
    const unit = await this.prisma.unit.findUnique({
      where: { publicId: unitPublicId },
      select: { id: true },
    });
    if (!unit) throw new Error('unit not found');
    const row = await this.prisma.lesson.create({
      data: { ...childData(input), unitId: unit.id },
      select: LESSON_SELECT,
    });
    return toLesson(row);
  }

  // --- learning items ----------------------------------------------------
  async findItemByPublicId(publicId: string): Promise<StoredItem | null> {
    const row = await this.prisma.learningItem.findUnique({
      where: { publicId },
      select: ITEM_SELECT,
    });
    return row ? toItem(row) : null;
  }

  async createItem(input: CreateItemInput): Promise<StoredItem> {
    const row = await this.prisma.learningItem.create({
      data: {
        publicId: input.publicId,
        kind: input.kind,
        simplified: input.simplified,
        traditional: input.traditional,
        pinyin: input.pinyin,
        meaning: input.meaning,
        hskLevel: input.hskLevel,
        reference: (input.reference ?? undefined) as never,
        authorId: input.authorId,
      },
      select: ITEM_SELECT,
    });
    return toItem(row);
  }

  async listItemsByKind(kind: LearningItemKind): Promise<StoredItem[]> {
    const rows = await this.prisma.learningItem.findMany({
      where: { kind },
      select: ITEM_SELECT,
      orderBy: [{ publicId: 'asc' }],
    });
    return rows.map(toItem);
  }

  async listItemsByLesson(lessonPublicId: string): Promise<StoredLessonItem[]> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { publicId: lessonPublicId },
      select: { id: true },
    });
    if (!lesson) return [];
    const rows = await this.prisma.lessonLearningItem.findMany({
      where: { lessonId: lesson.id },
      select: { position: true, learningItem: { select: { publicId: true } } },
      orderBy: [{ position: 'asc' }],
    });
    return rows.map((r) => ({
      learningItemPublicId: r.learningItem.publicId,
      position: r.position,
    }));
  }

  async attachItemToLesson(
    lessonPublicId: string,
    itemPublicId: string,
    position: number,
  ): Promise<void> {
    const [lesson, item] = await Promise.all([
      this.prisma.lesson.findUnique({ where: { publicId: lessonPublicId }, select: { id: true } }),
      this.prisma.learningItem.findUnique({
        where: { publicId: itemPublicId },
        select: { id: true },
      }),
    ]);
    if (!lesson) throw new Error('lesson not found');
    if (!item) throw new Error('learning item not found');
    await this.prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: item.id, position },
    });
  }
}
