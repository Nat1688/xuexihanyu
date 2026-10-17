/**
 * Learner-progress reader for TODAY/RESULT (CP-05).
 *
 * Reads ONLY the acting learner's CP-04 projections and their own submission
 * count since a UTC-day boundary. Both queries are scoped by the server-derived
 * actor public id; there is no method that can read another learner's state.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../foundation/prisma.service';
import { type MasteryState } from '../../mastery/domain';
import { type StudentProgressReader, type StudentProjection } from '../application/student-ports';

@Injectable()
export class PrismaStudentProgressReader implements StudentProgressReader {
  constructor(private readonly prisma: PrismaService) {}

  async listProjections(actorPublicId: string): Promise<StudentProjection[]> {
    const actor = await this.prisma.user.findUnique({
      where: { publicId: actorPublicId },
      select: { id: true },
    });
    if (!actor) return [];

    const rows = await this.prisma.masteryProjection.findMany({
      where: { actorId: actor.id },
      select: {
        state: true,
        dueAt: true,
        learningItem: { select: { publicId: true } },
      },
    });

    return rows.map((row) => ({
      learningItemPublicId: row.learningItem.publicId,
      state: row.state as MasteryState,
      dueAt: row.dueAt,
    }));
  }

  async countSubmissionsSince(actorPublicId: string, since: Date): Promise<number> {
    const actor = await this.prisma.user.findUnique({
      where: { publicId: actorPublicId },
      select: { id: true },
    });
    if (!actor) return 0;

    return this.prisma.answerSubmission.count({
      where: {
        createdAt: { gte: since },
        exerciseSession: { actorId: actor.id },
      },
    });
  }
}
