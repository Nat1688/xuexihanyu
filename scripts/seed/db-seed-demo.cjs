#!/usr/bin/env node
'use strict';

// DS-01: explicit disposable target, fail-closed ownership, atomic seed.
const { createHash } = require('node:crypto');
const { SYNTHETIC_FIXTURES } = require('./synthetic-fixtures.cjs');
const { hashPassword, hashParameters } = require('./scrypt-hash.cjs');
const {
  DEMO_COURSE,
  DEMO_CLASS,
  DEMO_AUTHOR_KEY,
  DEMO_CLASS_OWNER_KEY,
  DEMO_STUDENT_KEYS,
  DEMO_ASSIGNMENTS,
  listDemoLessons,
} = require('./demo-fixtures.cjs');
const DEMO_DB_NAME = 'clp_demo_ds01';
const CONFIRMATION = 'DS-01_DISPOSABLE_ONLY';

function assertDemoTarget(raw, confirmation, environment = process.env.NODE_ENV) {
  try {
    const u = new URL(raw);
    // Query options can redirect a seemingly local URL. Refuse all overrides.
    if (
      !['postgres:', 'postgresql:'].includes(u.protocol) ||
      !['127.0.0.1', '[::1]'].includes(u.hostname) ||
      u.pathname !== `/${DEMO_DB_NAME}` ||
      !u.port ||
      u.search ||
      u.hash ||
      confirmation !== CONFIRMATION ||
      environment === 'production'
    )
      throw new Error();
    return { allowed: true, target: `${u.hostname}:${u.port}/${DEMO_DB_NAME}` };
  } catch {
    return {
      allowed: false,
      reason:
        'Explicit loopback clp_demo_ds01 URL and DS-01 disposable confirmation required; production and URL overrides refused.',
    };
  }
}

// Internal fixture IDs only. Public IDs remain random UUIDv4 per API contracts.
function demoId(key) {
  const ns = Buffer.from('a82a7c8f563b4d47bfb80e52d0af3b61', 'hex');
  const b = createHash('sha1').update(ns).update(`ds01:${key}`).digest().subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function conflict() {
  throw new Error(
    'DS01_SCOPE_CONFLICT: existing data does not belong to this demo fixture; no changes committed.',
  );
}

async function ensureRow(table, key, where, data, ownership) {
  const id = demoId(key);
  const row = await table.findUnique({ where });
  if (row) {
    if (row.id !== id || Object.entries(ownership).some(([k, v]) => row[k] !== v)) conflict();
    return table.update({ where: { id: row.id }, data });
  }
  if (await table.findUnique({ where: { id } })) conflict();
  return table.create({ data: { ...data, ...ownership, id } });
}

async function runDemoSeed(options) {
  const { url, confirmation, password, now = new Date(), onPhase = async () => {} } = options;
  const decision = assertDemoTarget(url, confirmation);
  if (!decision.allowed) throw new Error(decision.reason);
  if (typeof password !== 'string' || password.length < 16 || password.length > 128)
    throw new Error('DEMO_PASSWORD must contain 16–128 characters.');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(71001, 1)`;
        const ids = new Map();
        for (const fixture of SYNTHETIC_FIXTURES) {
          const login = `${fixture.key}@example.invalid`;
          const id = demoId(`user:${fixture.key}`);
          let user = await tx.user.findUnique({
            where: { loginNormalized: login },
            include: { roles: true, credential: true },
          });
          if (user) {
            if (
              user.id !== id ||
              user.login !== login ||
              user.state !== fixture.state ||
              user.roles
                .map((r) => r.role)
                .sort()
                .join() !== [...fixture.roles].sort().join() ||
              !user.credential
            )
              conflict();
            // Never rotate an existing credential or overwrite account state/roles.
          } else {
            if (await tx.user.findUnique({ where: { id } })) conflict();
            user = await tx.user.create({
              data: {
                id,
                login,
                loginNormalized: login,
                state: fixture.state,
                roles: { create: fixture.roles.map((role) => ({ role })) },
                credential: {
                  create: {
                    algorithm: 'scrypt',
                    parameters: hashParameters(),
                    hash: hashPassword(password),
                  },
                },
              },
            });
          }
          ids.set(fixture.key, user.id);
        }
        await onPhase('identities');
        const authorId = ids.get(DEMO_AUTHOR_KEY);
        const course = await ensureRow(
          tx.course,
          'course',
          { slug: DEMO_COURSE.slug },
          {
            slug: DEMO_COURSE.slug,
            title: DEMO_COURSE.title,
            description: DEMO_COURSE.description,
            position: DEMO_COURSE.position,
            visibility: 'PUBLISHED',
          },
          { authorId },
        );
        const lessons = [];
        for (const unitDef of DEMO_COURSE.units) {
          const unit = await ensureRow(
            tx.unit,
            `unit:${unitDef.slug}`,
            {
              courseId_slug: { courseId: course.id, slug: unitDef.slug },
            },
            {
              slug: unitDef.slug,
              title: unitDef.title,
              description: unitDef.description,
              position: unitDef.position,
              visibility: 'PUBLISHED',
            },
            { courseId: course.id },
          );
          for (const lessonDef of unitDef.lessons) {
            const lesson = await ensureRow(
              tx.lesson,
              `lesson:${lessonDef.slug}`,
              {
                unitId_slug: { unitId: unit.id, slug: lessonDef.slug },
              },
              {
                slug: lessonDef.slug,
                title: lessonDef.title,
                description: lessonDef.description,
                position: lessonDef.position,
                visibility: 'PUBLISHED',
              },
              { unitId: unit.id },
            );
            lessons.push(lesson);
            for (const [position, item] of lessonDef.items.entries()) {
              const id = demoId(`item:${lessonDef.slug}:${position}`);
              const stored = await tx.learningItem.findUnique({ where: { id } });
              const data = {
                kind: item.kind,
                simplified: item.simplified,
                traditional: item.traditional ?? null,
                pinyin: item.pinyin ?? null,
                meaning: item.meaning,
                hskLevel: item.hskLevel ?? null,
              };
              // Do not rewrite history-bearing items. Matching non-demo text is ignored.
              if (
                stored &&
                (stored.authorId !== authorId ||
                  Object.entries(data).some(([k, v]) => stored[k] !== v))
              )
                conflict();
              const saved =
                stored ?? (await tx.learningItem.create({ data: { ...data, authorId, id } }));
              const atPosition = await tx.lessonLearningItem.findUnique({
                where: { lessonId_position: { lessonId: lesson.id, position } },
              });
              if (atPosition && atPosition.learningItemId !== saved.id) conflict();
              await tx.lessonLearningItem.upsert({
                where: {
                  lessonId_learningItemId: { lessonId: lesson.id, learningItemId: saved.id },
                },
                create: { lessonId: lesson.id, learningItemId: saved.id, position },
                update: { position },
              });
            }
          }
        }
        await onPhase('content');
        const ownerId = ids.get(DEMO_CLASS_OWNER_KEY);
        const klass = await ensureRow(
          tx.teachingClass,
          'class',
          { id: demoId('class') },
          { title: DEMO_CLASS.title, term: DEMO_CLASS.term },
          { ownerId },
        );
        for (const key of DEMO_STUDENT_KEYS) {
          const studentId = ids.get(key);
          await tx.classEnrollment.upsert({
            where: { classId_studentId: { classId: klass.id, studentId } },
            create: { classId: klass.id, studentId, enrolledAt: now },
            update: {},
          });
          for (const lesson of lessons) {
            await tx.lessonAssignment.upsert({
              where: {
                classId_studentId_lessonId: { classId: klass.id, studentId, lessonId: lesson.id },
              },
              create: {
                classId: klass.id,
                studentId,
                lessonId: lesson.id,
                dueAt: new Date(now.getTime() + DEMO_ASSIGNMENTS.dueInDays * 86400000),
              },
              update: {},
            });
          }
        }
        await onPhase('assignments');
        return {
          identities: SYNTHETIC_FIXTURES.length,
          courses: 1,
          units: DEMO_COURSE.units.length,
          lessons: lessons.length,
          items: listDemoLessons().reduce((n, l) => n + l.items.length, 0),
          classes: 1,
          enrollments: DEMO_STUDENT_KEYS.length,
          assignments: DEMO_STUDENT_KEYS.length * lessons.length,
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--dry-run')) {
    process.exitCode = 2;
    throw new Error('Only --dry-run is supported.');
  }
  const options = {
    url: process.env.DEMO_DATABASE_URL,
    confirmation: process.env.DEMO_SEED_CONFIRM,
    password: process.env.DEMO_PASSWORD,
  };
  const decision = assertDemoTarget(options.url, options.confirmation);
  if (!decision.allowed) throw new Error(decision.reason);
  if (args.includes('--dry-run')) {
    console.log(
      '[demo-seed] dry-run: 7 identities, 1 course, 2 units, 3 lessons, 13 items, 1 class, 2 enrollments, 6 assignments; no connection.',
    );
    return;
  }
  console.log('[demo-seed] committed:', JSON.stringify(await runDemoSeed(options)));
}
if (require.main === module)
  main().catch(() => {
    // Raw Prisma errors may include parameters or connection information.
    console.error(
      '[demo-seed] refused or failed; transaction rolled back. Check target confirmation, credentials and demo ownership.',
    );
    process.exitCode = process.exitCode || 1;
  });
module.exports = { DEMO_DB_NAME, CONFIRMATION, assertDemoTarget, demoId, runDemoSeed };
