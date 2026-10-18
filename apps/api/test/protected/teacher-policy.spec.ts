/**
 * CP-06 teacher policy — pure unit tests (no Nest, no DB).
 *
 * Proves the OBJECT-LEVEL authorization rules in isolation:
 *   - teacher routes admit TEACHER/ADMIN only;
 *   - class/student/evidence visibility = owner, or bounded ADMIN;
 *   - private notes = AUTHOR ONLY (ADMIN excluded);
 *   - a missing/empty owner never matches (no "null == null" bypass);
 *   - note body/title bounds + control-character stripping;
 *   - evidence window clamping (1..366 days, deterministic half-open window);
 *   - weak-item ranking is deterministic and bounded.
 */
import {
  boundedWindow,
  canReadClass,
  canReadEvidence,
  canReadNote,
  canReadStudent,
  canWriteNote,
  DEFAULT_WINDOW_DAYS,
  evidenceWindow,
  isAdmin,
  isOwner,
  isPublicId,
  isTeacherOrAdmin,
  isTeacherViewer,
  MAX_WEAK_ITEMS,
  MAX_WINDOW_DAYS,
  normaliseNoteTitle,
  NOTE_BODY_MAX,
  rankWeakItems,
  validateNoteBody,
  type WeakRankInput,
} from '../../src/modules/teacher/domain';

const TEACHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TEACHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-10-17T12:00:00.000Z');

describe('teacher roles', () => {
  it('admits TEACHER and ADMIN only', () => {
    expect(isTeacherViewer(['TEACHER'])).toBe(true);
    expect(isTeacherViewer(['STUDENT'])).toBe(false);
    expect(isAdmin(['ADMIN'])).toBe(true);
    expect(isTeacherOrAdmin(['ADMIN'])).toBe(true);
    expect(isTeacherOrAdmin(['TEACHER', 'STUDENT'])).toBe(true);
    expect(isTeacherOrAdmin(['STUDENT'])).toBe(false);
    expect(isTeacherOrAdmin([])).toBe(false);
  });
});

describe('ownership', () => {
  it('matches only a non-empty exact owner id', () => {
    expect(isOwner(TEACHER, TEACHER)).toBe(true);
    expect(isOwner(OTHER_TEACHER, TEACHER)).toBe(false);
    expect(isOwner(null, '')).toBe(false);
    expect(isOwner(undefined, '')).toBe(false);
    expect(isOwner('', '')).toBe(false);
  });
});

describe('class / student / evidence visibility', () => {
  it('lets the owner teacher read', () => {
    expect(canReadClass(TEACHER, ['TEACHER'], TEACHER)).toBe(true);
    expect(canReadStudent(TEACHER, ['TEACHER'], TEACHER)).toBe(true);
    expect(canReadEvidence(TEACHER, ['TEACHER'], TEACHER)).toBe(true);
  });

  it('denies another teacher — including one who also holds ADMIN-less roles', () => {
    expect(canReadClass(OTHER_TEACHER, ['TEACHER'], TEACHER)).toBe(false);
    expect(canReadStudent(OTHER_TEACHER, ['TEACHER'], TEACHER)).toBe(false);
    expect(canReadEvidence(OTHER_TEACHER, ['TEACHER'], TEACHER)).toBe(false);
  });

  it('gives ADMIN bounded operational visibility over classes/students/evidence', () => {
    expect(canReadClass(ADMIN, ['ADMIN'], TEACHER)).toBe(true);
    expect(canReadStudent(ADMIN, ['ADMIN'], TEACHER)).toBe(true);
    expect(canReadEvidence(ADMIN, ['ADMIN'], TEACHER)).toBe(true);
  });

  it('denies a student even if they somehow reach the policy', () => {
    expect(canReadClass('dddddddd-dddd-4ddd-8ddd-dddddddddddd', ['STUDENT'], TEACHER)).toBe(false);
  });
});

describe('private notes', () => {
  it('is author-only, and ADMIN visibility is explicitly excluded', () => {
    expect(canReadNote(TEACHER, TEACHER)).toBe(true);
    expect(canReadNote(ADMIN, TEACHER)).toBe(false);
    expect(canReadNote(OTHER_TEACHER, TEACHER)).toBe(false);
    expect(canWriteNote(TEACHER, TEACHER)).toBe(true);
    expect(canWriteNote(ADMIN, TEACHER)).toBe(false);
  });

  it('validates body bounds', () => {
    expect(validateNoteBody('  needs practice on tones  ')).toBe('needs practice on tones');
    expect(() => validateNoteBody('   ')).toThrow();
    expect(() => validateNoteBody(42)).toThrow();
    expect(() => validateNoteBody('x'.repeat(NOTE_BODY_MAX + 1))).toThrow();
    expect(validateNoteBody('x'.repeat(NOTE_BODY_MAX))).toHaveLength(NOTE_BODY_MAX);
  });

  it('strips control characters but keeps newlines/tabs', () => {
    expect(validateNoteBody('a\u0000b\u0007c\nline2\tend')).toBe('abc\nline2\tend');
  });

  it('normalises optional titles', () => {
    expect(normaliseNoteTitle(undefined)).toBeNull();
    expect(normaliseNoteTitle('   ')).toBeNull();
    expect(normaliseNoteTitle('  Week 1  ')).toBe('Week 1');
    expect(() => normaliseNoteTitle('t'.repeat(121))).toThrow();
    expect(() => normaliseNoteTitle(7)).toThrow();
  });
});

describe('id shape', () => {
  it('accepts canonical UUIDs and rejects anything else', () => {
    expect(isPublicId(TEACHER)).toBe(true);
    expect(isPublicId('not-a-uuid')).toBe(false);
    expect(isPublicId('')).toBe(false);
    expect(isPublicId(null)).toBe(false);
    expect(isPublicId(123)).toBe(false);
  });
});

describe('evidence window', () => {
  it('defaults and clamps to policy bounds', () => {
    expect(boundedWindow(undefined)).toBe(DEFAULT_WINDOW_DAYS);
    expect(boundedWindow(0)).toBe(DEFAULT_WINDOW_DAYS);
    expect(boundedWindow(-5)).toBe(DEFAULT_WINDOW_DAYS);
    expect(boundedWindow(Number.NaN)).toBe(DEFAULT_WINDOW_DAYS);
    expect(boundedWindow(7)).toBe(7);
    expect(boundedWindow(10_000)).toBe(MAX_WINDOW_DAYS);
  });

  it('builds a deterministic half-open window ending at `now`', () => {
    const w = evidenceWindow(NOW, 30);
    expect(w.to).toEqual(NOW);
    expect(w.from.toISOString()).toBe('2026-09-17T12:00:00.000Z');
    expect(NOW.getTime() - w.from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('weak item ranking', () => {
  const item = (
    over: Partial<WeakRankInput> & { learningItemPublicId: string },
  ): WeakRankInput => ({
    state: 'LEARNING',
    consecutiveCorrect: 0,
    correctInWindow: 0,
    incorrectInWindow: 0,
    dueAt: null,
    ...over,
  });

  it('orders by state, then accuracy, then incorrect count, then due date, then id', () => {
    const rows = rankWeakItems(
      [
        item({ learningItemPublicId: 'i-mastered', state: 'MASTERED', correctInWindow: 9 }),
        item({
          learningItemPublicId: 'i-learning',
          state: 'LEARNING',
          correctInWindow: 1,
          incorrectInWindow: 1,
        }),
        item({ learningItemPublicId: 'i-new', state: 'NEW' }),
        item({
          learningItemPublicId: 'i-familiar',
          state: 'FAMILIAR',
          correctInWindow: 3,
          incorrectInWindow: 1,
          dueAt: new Date('2026-10-18T00:00:00.000Z'),
        }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.learningItemPublicId)).toEqual([
      'i-new',
      'i-learning',
      'i-familiar',
      'i-mastered',
    ]);
  });

  it('breaks ties deterministically and respects the limit', () => {
    const rows = rankWeakItems(
      [
        item({ learningItemPublicId: 'i-b', state: 'NEW' }),
        item({ learningItemPublicId: 'i-a', state: 'NEW' }),
        item({ learningItemPublicId: 'i-c', state: 'NEW' }),
      ],
      NOW,
      2,
    );
    expect(rows.map((r) => r.learningItemPublicId)).toEqual(['i-a', 'i-b']);
    const capped = rankWeakItems(
      Array.from({ length: 25 }, (_, i) =>
        item({ learningItemPublicId: `i-${String(i).padStart(2, '0')}`, state: 'NEW' }),
      ),
      NOW,
    );
    expect(capped).toHaveLength(MAX_WEAK_ITEMS);
  });

  it('drops MASTERED items with no window evidence', () => {
    const rows = rankWeakItems([item({ learningItemPublicId: 'i-m', state: 'MASTERED' })], NOW);
    expect(rows).toEqual([]);
  });
});
