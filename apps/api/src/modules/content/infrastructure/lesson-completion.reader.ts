import type { PrismaClient } from '@prisma/client';
type CompletionDb = Pick<PrismaClient, 'lessonLearningItem' | 'learningEvent'>;
export interface CompletionPair {
  studentId: string;
  lessonId: string;
}
export const completionKey = (studentId: string, lessonId: string) => `${studentId}/${lessonId}`;
/** Owner rule: every current VI_TO_ZH-capable item correct at least once.
 * Historical accepted evidence is retained; zero exercise items is incomplete.
 * Batch in bounded groups, so dashboards do not issue two queries per assignment.
 */
export async function readLessonCompletions(db: CompletionDb, pairs: CompletionPair[]) {
  const unique = [
    ...new Map(pairs.map((pair) => [completionKey(pair.studentId, pair.lessonId), pair])).values(),
  ];
  const result = new Map<string, { total: number; correct: number; completed: boolean }>();
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100);
    const links = await db.lessonLearningItem.findMany({
      where: { lesson: { publicId: { in: batch.map((pair) => pair.lessonId) } } },
      select: {
        lesson: { select: { publicId: true } },
        learningItem: { select: { publicId: true, simplified: true, meaning: true } },
      },
    });
    const eligible = new Map<string, Set<string>>();
    for (const link of links)
      if (link.learningItem.simplified?.trim() && link.learningItem.meaning?.trim()) {
        const ids = eligible.get(link.lesson.publicId) || new Set<string>();
        ids.add(link.learningItem.publicId);
        eligible.set(link.lesson.publicId, ids);
      }
    const events = await db.learningEvent.findMany({
      where: {
        OR: batch.map((pair) => ({
          actor: { publicId: pair.studentId },
          lesson: { publicId: pair.lessonId },
        })),
        type: 'ANSWER_SUBMITTED',
        metadata: { path: ['outcome'], equals: 'correct' },
      },
      distinct: ['actorId', 'lessonId', 'learningItemId'],
      select: {
        actor: { select: { publicId: true } },
        lesson: { select: { publicId: true } },
        learningItem: { select: { publicId: true } },
      },
    });
    const correctIds = new Map<string, Set<string>>();
    for (const event of events)
      if (
        event.lesson &&
        event.learningItem &&
        eligible.get(event.lesson.publicId)?.has(event.learningItem.publicId)
      ) {
        const key = completionKey(event.actor.publicId, event.lesson.publicId);
        const ids = correctIds.get(key) || new Set<string>();
        ids.add(event.learningItem.publicId);
        correctIds.set(key, ids);
      }
    for (const pair of batch) {
      const key = completionKey(pair.studentId, pair.lessonId);
      const total = eligible.get(pair.lessonId)?.size || 0;
      const correct = correctIds.get(key)?.size || 0;
      result.set(key, { total, correct, completed: total > 0 && correct === total });
    }
  }
  return result;
}
