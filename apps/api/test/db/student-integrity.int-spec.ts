import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';
import { PrismaService } from '../../src/modules/foundation/prisma.service';
import { LearningEventService } from '../../src/modules/learning-events/application/learning-event-service';
import {
  LearningEventConflictError,
  makeLearningEvent,
} from '../../src/modules/learning-events/domain';
import { PrismaLearningEventRepository } from '../../src/modules/learning-events/infrastructure/prisma-learning-event.repository';
import { MasteryService } from '../../src/modules/mastery/application/mastery-service';
import { PrismaMasteryEventReader } from '../../src/modules/mastery/infrastructure/prisma-mastery-event.reader';
import { PrismaMasteryProjectionRepository } from '../../src/modules/mastery/infrastructure/prisma-mastery-projection.repository';
import { StudentService } from '../../src/modules/student/application/student-service';
import {
  type AnswerSessionRepository,
  type NewAnswerSubmission,
  type StudentContentReader,
} from '../../src/modules/student/application/student-ports';
import { StudentAlreadyAnsweredError } from '../../src/modules/student/domain';
import { PrismaAnswerSessionRepository } from '../../src/modules/student/infrastructure/prisma-answer-session.repository';
import { PrismaStudentProgressReader } from '../../src/modules/student/infrastructure/prisma-student-progress.reader';
import { type ExerciseService } from '../../src/modules/exercise/application/exercise-service';

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);
const describeDb = RUNNABLE ? describe : describe.skip;
const NOW = new Date('2026-10-20T10:00:00.000Z');

interface Fixture {
  actorId: string;
  actorPublicId: string;
  itemId: string;
  itemPublicId: string;
  lessonPublicId: string;
  sessionPublicId: string;
}

describeDb('CP-05 integrity remediation (PostgreSQL 17)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const prismaService = prisma as unknown as PrismaService;
  const sessions = new PrismaAnswerSessionRepository(prismaService);
  const eventRepository = new PrismaLearningEventRepository(prismaService);
  const events = new LearningEventService({ repository: eventRepository });
  const mastery = new MasteryService({
    events: new PrismaMasteryEventReader(prismaService),
    projections: new PrismaMasteryProjectionRepository(prismaService),
  });
  const progress = new PrismaStudentProgressReader(prismaService);
  const actorIds: string[] = [];
  const itemIds: string[] = [];
  const courseIds: string[] = [];

  function tag(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function fixture(): Promise<Fixture> {
    const suffix = tag();
    const actor = await prisma.user.create({
      data: { login: `cp05-${suffix}`, loginNormalized: `cp05-${suffix}` },
    });
    actorIds.push(actor.id);
    const course = await prisma.course.create({
      data: { slug: `cp05-${suffix}`, title: 'CP-05 Test', authorId: actor.id },
    });
    courseIds.push(course.id);
    const unit = await prisma.unit.create({
      data: { slug: `unit-${suffix}`, title: 'Unit', courseId: course.id },
    });
    const lesson = await prisma.lesson.create({
      data: {
        slug: `lesson-${suffix}`,
        title: 'Lesson',
        unitId: unit.id,
        visibility: 'PUBLISHED',
      },
    });
    const item = await prisma.learningItem.create({
      data: { kind: 'VOCABULARY', simplified: '你', meaning: 'you', authorId: actor.id },
    });
    itemIds.push(item.id);
    await prisma.lessonLearningItem.create({
      data: { lessonId: lesson.id, learningItemId: item.id },
    });
    const session = await prisma.answerSession.create({
      data: {
        actorId: actor.id,
        lessonId: lesson.id,
        learningItemId: item.id,
        mode: 'VI_TO_ZH',
        format: 'TYPING',
        prompt: 'you',
        answerKey: '你',
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      },
    });
    return {
      actorId: actor.id,
      actorPublicId: actor.publicId,
      itemId: item.id,
      itemPublicId: item.publicId,
      lessonPublicId: lesson.publicId,
      sessionPublicId: session.publicId,
    };
  }

  function submission(sessionPublicId: string, token: string): NewAnswerSubmission {
    return {
      sessionPublicId,
      submissionToken: token,
      submittedAnswer: '你',
      correct: true,
      feedback: 'CORRECT',
      expected: '你',
      received: '你',
      learningEventPublicId: null,
    };
  }

  function eventInput(
    f: Fixture,
    publicId = randomUUID(),
    outcome: 'correct' | 'incorrect' = 'correct',
  ) {
    return makeLearningEvent({
      publicId,
      type: 'ANSWER_SUBMITTED',
      actorPublicId: f.actorPublicId,
      occurredAt: NOW,
      lessonPublicId: f.lessonPublicId,
      learningItemPublicId: f.itemPublicId,
      exerciseRef: f.sessionPublicId,
      metadata: { outcome },
    });
  }

  function recoveryService(
    sessionPort: AnswerSessionRepository = sessions,
    eventService: LearningEventService = events,
    masteryService: MasteryService = mastery,
  ): StudentService {
    const content: StudentContentReader = {
      listPublishedLessons: async () => [],
      listPublishedLessonItems: async () => [],
    };
    return new StudentService({
      content,
      progress,
      sessions: sessionPort,
      exercises: {} as ExerciseService,
      events: eventService,
      mastery: masteryService,
      mode: 'VI_TO_ZH',
      format: 'TYPING',
    });
  }

  afterAll(async () => {
    await prisma.masteryProjection.deleteMany({ where: { actorId: { in: actorIds } } });
    await prisma.answerSubmission.deleteMany({
      where: { exerciseSession: { actorId: { in: actorIds } } },
    });
    await prisma.answerSession.deleteMany({ where: { actorId: { in: actorIds } } });
    await prisma.learningEvent.deleteMany({ where: { actorId: { in: actorIds } } });
    await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    await prisma.learningItem.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
    await prisma.$disconnect();
  });

  it('same-session same-token requests converge on one PostgreSQL row', async () => {
    const f = await fixture();
    const input = submission(f.sessionPublicId, `same-${tag()}`);

    const [left, right] = await Promise.all([
      sessions.insertSubmission(input),
      sessions.insertSubmission(input),
    ]);

    expect(right).toEqual(left);
    const row = await prisma.answerSession.findUniqueOrThrow({
      where: { publicId: f.sessionPublicId },
      select: { id: true },
    });
    await expect(
      prisma.answerSubmission.count({ where: { exerciseSessionId: row.id } }),
    ).resolves.toBe(1);
  });

  it('same-session different-token requests produce one winner and one conflict', async () => {
    const f = await fixture();
    const settled = await Promise.allSettled([
      sessions.insertSubmission(submission(f.sessionPublicId, `left-${tag()}`)),
      sessions.insertSubmission(submission(f.sessionPublicId, `right-${tag()}`)),
    ]);

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : null).toBeInstanceOf(
      StudentAlreadyAnsweredError,
    );
    const row = await prisma.answerSession.findUniqueOrThrow({
      where: { publicId: f.sessionPublicId },
      select: { id: true },
    });
    await expect(
      prisma.answerSubmission.count({ where: { exerciseSessionId: row.id } }),
    ).resolves.toBe(1);
  });

  it('the preflight shape detects duplicates without selecting or deleting a winner', async () => {
    const f = await fixture();
    await sessions.insertSubmission(submission(f.sessionPublicId, `preflight-${tag()}`));
    const session = await prisma.answerSession.findUniqueOrThrow({
      where: { publicId: f.sessionPublicId },
      select: { id: true },
    });
    const rollback = new Error('rollback preflight probe');

    await expect(
      prisma.$transaction(async (tx) => {
        // Transactional DDL is rolled back with the synthetic duplicate below.
        await tx.$executeRawUnsafe('DROP INDEX "answer_submissions_exercise_session_id_key"');
        const original = await tx.answerSubmission.findFirstOrThrow({
          where: { exerciseSessionId: session.id },
        });
        await tx.answerSubmission.create({
          data: {
            exerciseSessionId: session.id,
            submissionToken: `duplicate-${tag()}`,
            submittedAnswer: original.submittedAnswer,
            correct: original.correct,
            feedback: original.feedback,
            expected: original.expected,
            received: original.received,
          },
        });
        const duplicates = await tx.$queryRaw<Array<{ submission_count: bigint }>>`
          SELECT COUNT(*) AS submission_count
          FROM "answer_submissions"
          WHERE "exercise_session_id" = ${session.id}::uuid
          GROUP BY "exercise_session_id"
          HAVING COUNT(*) > 1
        `;
        expect(duplicates).toHaveLength(1);
        expect(Number(duplicates[0].submission_count)).toBe(2);
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    await expect(
      prisma.answerSubmission.count({ where: { exerciseSessionId: session.id } }),
    ).resolves.toBe(1);
  });

  it('same UUID and same payload append concurrently as one event', async () => {
    const f = await fixture();
    const event = eventInput(f);

    const [left, right] = await Promise.all([
      eventRepository.append(event),
      eventRepository.append(event),
    ]);

    expect(right).toEqual(left);
    await expect(prisma.learningEvent.count({ where: { publicId: event.publicId } })).resolves.toBe(
      1,
    );
  });

  it('same UUID with different payload produces one event and one typed conflict', async () => {
    const f = await fixture();
    const publicId = randomUUID();
    const settled = await Promise.allSettled([
      eventRepository.append(eventInput(f, publicId, 'correct')),
      eventRepository.append(eventInput(f, publicId, 'incorrect')),
    ]);

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : null).toBeInstanceOf(
      LearningEventConflictError,
    );
    await expect(prisma.learningEvent.count({ where: { publicId } })).resolves.toBe(1);
  });

  it('recovers append, link and mastery failures without duplicate evidence', async () => {
    const actor = { roles: ['STUDENT'] as const };

    const appendFixture = await fixture();
    await sessions.insertSubmission(submission(appendFixture.sessionPublicId, `append-${tag()}`));
    let appendFailures = 1;
    const flakyEvents = {
      record: async (...args: Parameters<LearningEventService['record']>) => {
        if (appendFailures-- > 0) throw new Error('simulated append failure');
        return events.record(...args);
      },
    } as LearningEventService;
    const appendRecovery = recoveryService(sessions, flakyEvents, mastery);
    await expect(
      appendRecovery.recoverResult(
        { publicId: appendFixture.actorPublicId, ...actor },
        appendFixture.sessionPublicId,
        NOW,
      ),
    ).rejects.toThrow('simulated append failure');
    await appendRecovery.recoverResult(
      { publicId: appendFixture.actorPublicId, ...actor },
      appendFixture.sessionPublicId,
      NOW,
    );

    const linkFixture = await fixture();
    await sessions.insertSubmission(submission(linkFixture.sessionPublicId, `link-${tag()}`));
    let linkFailures = 1;
    const flakySessions: AnswerSessionRepository = {
      create: (input) => sessions.create(input),
      findByPublicId: (id, actorId) => sessions.findByPublicId(id, actorId),
      findWithSubmission: (id, actorId) => sessions.findWithSubmission(id, actorId),
      insertSubmission: (input) => sessions.insertSubmission(input),
      linkEvent: async (id, token, eventPublicId) => {
        if (linkFailures-- > 0) throw new Error('simulated link failure');
        return sessions.linkEvent(id, token, eventPublicId);
      },
    };
    const linkRecovery = recoveryService(flakySessions, events, mastery);
    await expect(
      linkRecovery.recoverResult(
        { publicId: linkFixture.actorPublicId, ...actor },
        linkFixture.sessionPublicId,
        NOW,
      ),
    ).rejects.toThrow('simulated link failure');
    await linkRecovery.recoverResult(
      { publicId: linkFixture.actorPublicId, ...actor },
      linkFixture.sessionPublicId,
      NOW,
    );

    const masteryFixture = await fixture();
    await sessions.insertSubmission(submission(masteryFixture.sessionPublicId, `mastery-${tag()}`));
    let masteryFailures = 1;
    const flakyMastery = {
      deriveForActor: async (...args: Parameters<MasteryService['deriveForActor']>) => {
        if (masteryFailures-- > 0) throw new Error('simulated mastery failure');
        return mastery.deriveForActor(...args);
      },
    } as MasteryService;
    const masteryRecovery = recoveryService(sessions, events, flakyMastery);
    await expect(
      masteryRecovery.recoverResult(
        { publicId: masteryFixture.actorPublicId, ...actor },
        masteryFixture.sessionPublicId,
        NOW,
      ),
    ).rejects.toThrow('simulated mastery failure');
    await masteryRecovery.recoverResult(
      { publicId: masteryFixture.actorPublicId, ...actor },
      masteryFixture.sessionPublicId,
      NOW,
    );

    for (const f of [appendFixture, linkFixture, masteryFixture]) {
      const stored = await sessions.findWithSubmission(f.sessionPublicId, f.actorPublicId);
      expect(stored?.submission?.learningEventPublicId).not.toBeNull();
      await expect(
        prisma.learningEvent.count({
          where: { actorId: f.actorId, exerciseRef: f.sessionPublicId },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.masteryProjection.count({
          where: { actorId: f.actorId, learningItemId: f.itemId },
        }),
      ).resolves.toBe(1);
    }
  });
});
