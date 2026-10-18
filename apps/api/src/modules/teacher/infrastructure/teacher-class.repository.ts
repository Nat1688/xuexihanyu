/**
 * CP-06 class adapter (`teaching_classes`).
 *
 * A class is owned by exactly one teacher (`owner_id`); visibility decisions
 * belong to the application policy, this adapter only resolves ids server-side
 * and projects counts.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import {
  type ClassRecord,
  type ClassRepository,
  type NewClass,
} from '../application/teacher-ports';

const CLASS_SELECT = {
  publicId: true,
  title: true,
  term: true,
  createdAt: true,
  owner: { select: { publicId: true } },
  _count: { select: { enrollments: true } },
} as const;

type ClassRow = {
  publicId: string;
  title: string;
  term: string | null;
  createdAt: Date;
  owner: { publicId: string };
  _count: { enrollments: number };
};

function toRecord(row: ClassRow): ClassRecord {
  return {
    publicId: row.publicId,
    title: row.title,
    term: row.term,
    ownerPublicId: row.owner.publicId,
    createdAt: row.createdAt,
    enrollmentCount: row._count.enrollments,
  };
}

@Injectable()
export class PrismaTeacherClassRepository implements ClassRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewClass): Promise<ClassRecord | null> {
    const owner = await this.prisma.user.findUnique({
      where: { publicId: input.ownerPublicId },
      select: { id: true },
    });
    if (!owner) return null;
    const row = await this.prisma.teachingClass.create({
      data: { ownerId: owner.id, title: input.title, term: input.term },
      select: CLASS_SELECT,
    });
    return toRecord(row);
  }

  async listOwned(ownerPublicId: string): Promise<ClassRecord[]> {
    const rows = await this.prisma.teachingClass.findMany({
      where: { owner: { publicId: ownerPublicId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: CLASS_SELECT,
    });
    return rows.map(toRecord);
  }

  async findByPublicId(publicId: string): Promise<ClassRecord | null> {
    const row = await this.prisma.teachingClass.findUnique({
      where: { publicId },
      select: CLASS_SELECT,
    });
    return row ? toRecord(row) : null;
  }
}
