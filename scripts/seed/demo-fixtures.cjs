#!/usr/bin/env node
/**
 * Local demo seed — deterministic DEMO CONTENT fixtures (dev-only).
 *
 * The CLP-00-11 synthetic seed (`db-seed-synthetic.cjs`) creates identities
 * only and explicitly "creates NO domain content". To exercise the real
 * teacher/student flows locally we also need a PUBLISHED course hierarchy with
 * Chinese learning items, a teaching class with enrolments and assignments.
 *
 * This module freezes that demo dataset so a rerun always produces the SAME
 * internal identifiers (stable slugs + scoped IDs in `db-seed-demo.cjs`).
 * Public IDs remain random UUIDv4. Author/owner keys reuse the synthetic fixture
 * definitions; the seed creates DS-01 identities and refuses to adopt existing
 * non-DS-01 accounts, even when their logins match.
 *
 * The demo class is attributed to `teacher.two` while the published content is
 * authored by `teacher.one` on purpose: a demo student sees published content
 * published by anyone, but teacher-owned classes stay private to their owner —
 * so logging in as `teacher.two` demonstrates a class-with-roster while
 * `teacher.one` (the author) owns the content. Nothing here is production data:
 * every title is explicitly synthetic and the class term is the fixed
 * `LOCAL-DEMO` display marker. Ownership is enforced by internal ID and owner.
 *
 * No password, connection string or secret is stored in this file.
 */
'use strict';

/** Content author (existing synthetic TEACHER fixture key). */
const DEMO_AUTHOR_KEY = 'teacher.one';

/** Class owner (existing synthetic TEACHER fixture key). */
const DEMO_CLASS_OWNER_KEY = 'teacher.two';

/** Enrolled demo students (existing synthetic ACTIVE STUDENT fixture keys). */
const DEMO_STUDENT_KEYS = Object.freeze(['student.one', 'student.two']);

/** The class `term` marker identifying the demo class. Bounded to 40 chars. */
const DEMO_CLASS_TERM = 'LOCAL-DEMO';

/** The single demo class (identified by its DS-01 internal UUID). */
const DEMO_CLASS = Object.freeze({
  title: 'Demo Class — Hello, Chinese (synthetic)',
  term: DEMO_CLASS_TERM,
});

/**
 * The published demo hierarchy. Slugs are the demo namespace `demo-*` so they
 * are identifiable; collisions with other authored content are refused.
 */
const DEMO_COURSE = Object.freeze({
  slug: 'demo-hello-chinese',
  title: 'Demo: Hello, Chinese (synthetic)',
  description:
    'Synthetic, local-only demo course. Every word and sentence here is sample data for demos and tests — not a real curriculum.',
  position: 0,
  units: Object.freeze([
    {
      slug: 'demo-greetings',
      title: 'Unit 1 — Greetings (synthetic)',
      description: 'Sample greetings used by the local demo seed.',
      position: 0,
      lessons: Object.freeze([
        {
          slug: 'demo-hello-goodbye',
          title: 'Lesson 1 — Hello and goodbye (synthetic)',
          description: 'Says hello and goodbye.',
          position: 0,
          items: Object.freeze([
            {
              kind: 'VOCABULARY',
              simplified: '你好',
              traditional: '你好',
              pinyin: 'nǐ hǎo',
              meaning: 'hello',
              hskLevel: 1,
            },
            {
              kind: 'VOCABULARY',
              simplified: '再见',
              traditional: '再見',
              pinyin: 'zài jiàn',
              meaning: 'goodbye',
              hskLevel: 1,
            },
            {
              kind: 'CHARACTER',
              simplified: '你',
              traditional: '你',
              pinyin: 'nǐ',
              meaning: 'you (singular)',
              hskLevel: 1,
            },
            {
              kind: 'CHARACTER',
              simplified: '好',
              traditional: '好',
              pinyin: 'hǎo',
              meaning: 'good; well',
              hskLevel: 1,
            },
            {
              kind: 'EXAMPLE',
              simplified: '你好！',
              traditional: '你好！',
              meaning: 'Hello!',
              hskLevel: 1,
            },
          ]),
        },
        {
          slug: 'demo-thank-you',
          title: 'Lesson 2 — Thank you (synthetic)',
          description: 'Says thank you and you are welcome.',
          position: 1,
          items: Object.freeze([
            {
              kind: 'VOCABULARY',
              simplified: '谢谢',
              traditional: '謝謝',
              pinyin: 'xiè xie',
              meaning: 'thank you',
              hskLevel: 1,
            },
            {
              kind: 'VOCABULARY',
              simplified: '不客气',
              traditional: '不客氣',
              pinyin: 'bú kè qi',
              meaning: "you're welcome",
              hskLevel: 1,
            },
            {
              kind: 'CHARACTER',
              simplified: '谢',
              traditional: '謝',
              pinyin: 'xiè',
              meaning: 'to thank',
              hskLevel: 1,
            },
            {
              kind: 'EXAMPLE',
              simplified: '谢谢你。',
              traditional: '謝謝你。',
              meaning: 'Thank you.',
              hskLevel: 1,
            },
          ]),
        },
      ]),
    },
    {
      slug: 'demo-verbs',
      title: 'Unit 2 — Everyday verbs (synthetic)',
      description: 'A tiny sample grammar lesson.',
      position: 1,
      lessons: Object.freeze([
        {
          slug: 'demo-to-go-to-eat',
          title: 'Lesson 3 — To go and to eat (synthetic)',
          description: 'Two everyday verbs with a sample sentence.',
          position: 0,
          items: Object.freeze([
            {
              kind: 'VOCABULARY',
              simplified: '去',
              traditional: '去',
              pinyin: 'qù',
              meaning: 'to go',
              hskLevel: 1,
            },
            {
              kind: 'VOCABULARY',
              simplified: '吃',
              traditional: '吃',
              pinyin: 'chī',
              meaning: 'to eat',
              hskLevel: 1,
            },
            {
              kind: 'GRAMMAR',
              simplified: '我去学校吃午饭。',
              meaning: 'I go to school to eat lunch.',
              hskLevel: 1,
            },
            {
              kind: 'EXAMPLE',
              simplified: '我想吃米饭。',
              traditional: '我想吃米飯。',
              meaning: 'I want to eat rice.',
              hskLevel: 1,
            },
          ]),
        },
      ]),
    },
  ]),
});

/**
 * Assignments the demo seed ensures: every enrolled student is assigned every
 * PUBLISHED demo lesson (the assignment unique key is class+student+lesson).
 * `dueInDays` is relative to the seed run so the demo never shows a stale due
 * window; idempotent re-runs keep the previously stored due date.
 */
const DEMO_ASSIGNMENTS = Object.freeze({ dueInDays: 7 });

/**
 * Flatten the demo hierarchy into ordered lesson entries (slug/title/items) so
 * the seed and the tests share ONE traversal of the fixture.
 *
 * @returns {Array<{ unitSlug: string, lessonSlug: string, lessonTitle: string, items: ReadonlyArray<object> }>}
 */
function listDemoLessons() {
  const out = [];
  for (const unit of DEMO_COURSE.units) {
    for (const lesson of unit.lessons) {
      out.push({
        unitSlug: unit.slug,
        lessonSlug: lesson.slug,
        lessonTitle: lesson.title,
        items: lesson.items,
      });
    }
  }
  return out;
}

/** A stable, human-readable item label (used for logs/tests only). */
function itemLabel(item) {
  return `${item.kind}:${item.simplified ?? '(media)'}`;
}

module.exports = {
  DEMO_AUTHOR_KEY,
  DEMO_CLASS_OWNER_KEY,
  DEMO_STUDENT_KEYS,
  DEMO_CLASS_TERM,
  DEMO_CLASS,
  DEMO_COURSE,
  DEMO_ASSIGNMENTS,
  listDemoLessons,
  itemLabel,
};
