/**
 * CP-06 private-note adapter (`teacher_notes`).
 *
 * Notes are privacy-critical: every read is filtered by `authorId` derived
 * from the CALLER's public id (never a client-supplied author), so a teacher
 * (or an ADMIN) can only ever retrieve notes their own account wrote.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import { type NewNote, type NoteRecord, type NoteRepository } from '../application/teacher-ports';

const NOTE_SELECT = {
  publicId: true,
  title: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { publicId: true } },
  class: { select: { publicId: true, owner: { select: { publicId: true } } } },
  student: { select: { publicId: true } },
} as const;

type NoteRow = {
  publicId: string;
  title: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { publicId: string };
  class: { publicId: string; owner: { publicId: string } };
  student: { publicId: string };
};

function toRecord(row: NoteRow): NoteRecord {
  return {
    publicId: row.publicId,
    authorPublicId: row.author.publicId,
    classPublicId: row.class.publicId,
    classOwnerPublicId: row.class.owner.publicId,
    studentPublicId: row.student.publicId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaTeacherNoteRepository implements NoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewNote): Promise<NoteRecord | null> {
    const [author, klass, student] = await Promise.all([
      this.prisma.user.findUnique({
        where: { publicId: input.authorPublicId },
        select: { id: true },
      }),
      this.prisma.teachingClass.findUnique({
        where: { publicId: input.classPublicId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { publicId: input.studentPublicId },
        select: { id: true },
      }),
    ]);
    if (!author || !klass || !student) return null;

    const row = await this.prisma.teacherNote.create({
      data: {
        authorId: author.id,
        classId: klass.id,
        studentId: student.id,
        title: input.title,
        body: input.body,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      select: NOTE_SELECT,
    });
    return toRecord(row);
  }

  async listAuthored(
    authorPublicId: string,
    classPublicId: string,
    studentPublicId: string,
  ): Promise<NoteRecord[]> {
    const rows = await this.prisma.teacherNote.findMany({
      where: {
        author: { publicId: authorPublicId },
        class: { publicId: classPublicId },
        student: { publicId: studentPublicId },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: NOTE_SELECT,
    });
    return rows.map(toRecord);
  }
}
