/**
 * Local demo seed — guard + fixture unit tests (pure; no DB, no network).
 *
 * Proves the safety contract of the demo seed that a reviewer relies on:
 *   - the target guard requires explicit disposable clp_demo_ds01 confirmation
 *     and loopback IP/port; rejects production, clp_dev, clp_test and URL overrides;
 *   - every demo fixture value satisfies the CP-01 domain contracts (slug
 *     pattern/length, title/term bounds, Chinese items carry the fields their
 *     kind requires) — so the seed cannot write content the API would reject;
 *   - the dataset uses the known synthetic fixture roles in example.invalid;
 *   - no plaintext credential literal appears in the seed source.
 *
 * The modules under test live outside the API workspace (repo `scripts/seed/`),
 * so they are required via relative CommonJS imports — dependency-free and
 * free of I/O.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAllFixtures } from '../../../../scripts/seed/synthetic-fixtures.cjs';
import {
  DEMO_AUTHOR_KEY,
  DEMO_CLASS,
  DEMO_CLASS_OWNER_KEY,
  DEMO_COURSE,
  DEMO_STUDENT_KEYS,
  DEMO_ASSIGNMENTS,
  listDemoLessons,
} from '../../../../scripts/seed/demo-fixtures.cjs';
import {
  DEMO_DB_NAME,
  assertDemoTarget,
  CONFIRMATION,
  demoId,
} from '../../../../scripts/seed/db-seed-demo.cjs';

const DEV_URL = 'postgresql://127.0.0.1:55433/clp_demo_ds01';
const TEST_URL = 'postgresql://clp_app:secret@127.0.0.1:5433/clp_test?schema=public';
const PROD_URL = 'postgresql://clp_app:secret@db.example.com:5432/clp_prod?schema=public';
const REMOTE_DEV_URL = 'postgresql://clp_app:secret@db.example.com:5432/clp_dev?schema=public';
const OTHER_LOCAL_URL = 'postgresql://clp_app:secret@localhost:5432/other_db?schema=public';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Shape of a resolved synthetic fixture (see `resolveFixture` in the seed). */
interface SyntheticFixture {
  key: string;
  login: string;
  roles: string[];
  state: string;
  password: string;
}

/**
 * The seed scripts are plain CommonJS outside the API tsconfig, so their
 * exports are untyped here; this narrows them for the assertions below.
 */
const fixturesOf = (fixtures: unknown): SyntheticFixture[] => fixtures as SyntheticFixture[];

const KIND_REQUIRED: Record<
  string,
  { simplified: boolean; pinyin: boolean; meaning: boolean; reference: boolean }
> = {
  VOCABULARY: { simplified: true, pinyin: true, meaning: true, reference: false },
  CHARACTER: { simplified: true, pinyin: true, meaning: true, reference: false },
  GRAMMAR: { simplified: true, pinyin: false, meaning: true, reference: false },
  EXAMPLE: { simplified: true, pinyin: false, meaning: true, reference: false },
  MEDIA_REFERENCE: { simplified: false, pinyin: false, meaning: false, reference: true },
};

describe('assertDemoTarget', () => {
  it('allows only the explicitly confirmed disposable target', () => {
    const decision = assertDemoTarget(DEV_URL, CONFIRMATION);
    expect(decision.allowed).toBe(true);
    expect(DEMO_DB_NAME).toBe('clp_demo_ds01');
  });

  it('refuses the local clp_test database (demo target is separate)', () => {
    const decision = assertDemoTarget(TEST_URL);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('clp_demo_ds01');
  });

  it('refuses a remote host even when the database is named clp_dev', () => {
    const decision = assertDemoTarget(REMOTE_DEV_URL);
    expect(decision.allowed).toBe(false);
  });

  it('refuses production and any other local database', () => {
    expect(assertDemoTarget(PROD_URL).allowed).toBe(false);
    expect(assertDemoTarget(OTHER_LOCAL_URL).allowed).toBe(false);
    expect(assertDemoTarget(undefined).allowed).toBe(false);
    expect(assertDemoTarget('not a url').allowed).toBe(false);
  });

  it('rejects unconfirmed targets, production runtime and connection overrides', () => {
    expect(assertDemoTarget(DEV_URL).allowed).toBe(false);
    expect(assertDemoTarget(DEV_URL, CONFIRMATION, 'production').allowed).toBe(false);
    for (const suffix of ['?host=remote', '?schema=other', '?options=x', '#fragment']) {
      expect(assertDemoTarget(DEV_URL + suffix, CONFIRMATION).allowed).toBe(false);
    }
    for (const url of [
      TEST_URL,
      PROD_URL,
      REMOTE_DEV_URL,
      OTHER_LOCAL_URL,
      'postgresql://127.0.0.1:5432/clp_dev',
    ]) {
      expect(assertDemoTarget(url, CONFIRMATION).allowed).toBe(false);
    }
  });
});

describe('demo fixtures — CP-01 domain contracts', () => {
  const lessons = listDemoLessons();

  it('has a demo course slug inside the demo namespace and within bounds', () => {
    expect(DEMO_COURSE.slug).toMatch(SLUG_PATTERN);
    expect(DEMO_COURSE.slug.startsWith('demo-')).toBe(true);
    expect(DEMO_COURSE.slug.length).toBeLessThanOrEqual(160);
    expect(DEMO_COURSE.title.trim().length).toBeGreaterThan(0);
    expect(DEMO_COURSE.title.length).toBeLessThanOrEqual(200);
    expect(DEMO_COURSE.position).toBe(0);
  });

  it('has unique, valid unit slugs and contiguous per-course positions', () => {
    const slugs = new Set<string>();
    DEMO_COURSE.units.forEach((unit, index) => {
      expect(unit.slug).toMatch(SLUG_PATTERN);
      expect(unit.slug.startsWith('demo-')).toBe(true);
      expect(slugs.has(unit.slug)).toBe(false);
      slugs.add(unit.slug);
      expect(unit.position).toBe(index);
    });
  });

  it('has unique, valid lesson slugs with contiguous per-unit positions', () => {
    const slugs = new Set<string>();
    for (const unit of DEMO_COURSE.units) {
      unit.lessons.forEach((lesson, index) => {
        expect(lesson.slug).toMatch(SLUG_PATTERN);
        expect(lesson.slug.startsWith('demo-')).toBe(true);
        expect(slugs.has(lesson.slug)).toBe(false);
        slugs.add(lesson.slug);
        expect(lesson.position).toBe(index);
      });
    }
    expect(lessons.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every item the Chinese fields its kind requires', () => {
    for (const lesson of lessons) {
      expect(lesson.items.length).toBeGreaterThan(0);
      for (const item of lesson.items) {
        const req = KIND_REQUIRED[item.kind];
        expect(req).toBeDefined();
        if (req.simplified) expect(item.simplified?.trim()).toBeTruthy();
        if (req.pinyin) expect(item.pinyin?.trim()).toBeTruthy();
        if (req.meaning) expect(item.meaning?.trim()).toBeTruthy();
        expect(Object.prototype.hasOwnProperty.call(item, 'reference')).toBe(req.reference);
        if (item.hskLevel !== undefined) {
          expect(Number.isInteger(item.hskLevel)).toBe(true);
          expect(item.hskLevel).toBeGreaterThanOrEqual(1);
          expect(item.hskLevel).toBeLessThanOrEqual(9);
        }
        for (const field of ['simplified', 'traditional', 'pinyin'] as const) {
          const value = item[field];
          if (value !== undefined) expect(value.length).toBeLessThanOrEqual(200);
        }
      }
    }
  });

  it('uses Chinese (CJK) text in every simplified field', () => {
    const cjk = /[\u4e00-\u9fff]/;
    for (const lesson of lessons) {
      for (const item of lesson.items) {
        expect(cjk.test(item.simplified)).toBe(true);
      }
    }
  });
});

describe('demo fixtures — synthetic identity attribution', () => {
  const fixtures = fixturesOf(resolveAllFixtures());
  const byKey = new Map(fixtures.map((f) => [f.key, f]));

  it('attributes authoring/ownership to existing synthetic TEACHER fixtures', () => {
    expect(byKey.get(DEMO_AUTHOR_KEY)!.roles).toEqual(['TEACHER']);
    expect(byKey.get(DEMO_CLASS_OWNER_KEY)!.roles).toEqual(['TEACHER']);
  });

  it('enrols only existing ACTIVE synthetic STUDENT fixtures', () => {
    expect(DEMO_STUDENT_KEYS.length).toBeGreaterThan(0);
    for (const key of DEMO_STUDENT_KEYS) {
      const fixture = byKey.get(key);
      expect(fixture).toBeDefined();
      expect(fixture!.roles).toEqual(['STUDENT']);
      expect(fixture!.state).toBe('ACTIVE');
      expect(fixture!.login.endsWith('@example.invalid')).toBe(true);
    }
  });

  it('keeps every synthetic fixture login in the reserved namespace', () => {
    for (const fixture of fixtures) {
      expect(fixture.login.endsWith('@example.invalid')).toBe(true);
    }
  });

  it('bounds the demo class fields to the CP-06 column limits', () => {
    expect(DEMO_CLASS.title.trim().length).toBeGreaterThan(0);
    expect(DEMO_CLASS.title.length).toBeLessThanOrEqual(120);
    expect(DEMO_CLASS.term.length).toBeGreaterThan(0);
    expect(DEMO_CLASS.term.length).toBeLessThanOrEqual(40);
  });

  it('assigns with a relative due window and a positive day offset', () => {
    expect(Number.isInteger(DEMO_ASSIGNMENTS.dueInDays)).toBe(true);
    expect(DEMO_ASSIGNMENTS.dueInDays).toBeGreaterThan(0);
  });
});

describe('demo seed — no committed credential', () => {
  // Resolve the seed scripts through the module loader so the check works
  // regardless of how the spec itself was compiled/placed.
  const seedDir = path.dirname(require.resolve('../../../../scripts/seed/db-seed-demo.cjs'));
  const files = ['demo-fixtures.cjs', 'db-seed-demo.cjs'];

  it('contains no password assignment or postgres URL with credentials', () => {
    for (const file of files) {
      const source = fs.readFileSync(path.join(seedDir, file), 'utf8');
      expect(source).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
      expect(source).not.toMatch(/postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/i);
    }
  });
});

describe('demo seed — helper exports (smoke)', () => {
  it('uses stable, distinct UUIDv5 namespace identifiers', () => {
    expect(demoId('course')).toBe(demoId('course'));
    expect(demoId('course')).not.toBe(demoId('class'));
    expect(demoId('course')).toMatch(/^[a-f0-9-]{14}5[a-f0-9-]+$/);
  });
});
