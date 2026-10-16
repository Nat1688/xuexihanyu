/**
 * CP-01 content domain unit tests (no Nest, no DB).
 *
 * Covers the pure contracts the CP-01 acceptance criteria require:
 *   - hierarchy ordering (position) + slug/title validation;
 *   - Chinese-specific item fields and the kind-specific required-field matrix;
 *   - the read visibility policy (students read PUBLISHED only).
 */
import {
  CONTENT_VISIBILITIES,
  HSK_MAX_LEVEL,
  HSK_MIN_LEVEL,
  LEARNING_ITEM_KINDS,
  SLUG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  ContentValidationError,
  canReadContent,
  filterReadable,
  isContentVisibility,
  isLearningItemKind,
  makeHierarchyNode,
  makeLearningItem,
  validateDescription,
  validateHskLevel,
  validatePosition,
  validateSlug,
  validateTitle,
} from '../../src/modules/content/domain';

describe('content visibility vocabulary', () => {
  it('exposes exactly DRAFT and PUBLISHED', () => {
    expect([...CONTENT_VISIBILITIES]).toEqual(['DRAFT', 'PUBLISHED']);
  });

  it('guards non-visibility values', () => {
    expect(isContentVisibility('DRAFT')).toBe(true);
    expect(isContentVisibility('PUBLISHED')).toBe(true);
    expect(isContentVisibility('draft')).toBe(false);
    expect(isContentVisibility('PRIVATE')).toBe(false);
    expect(isContentVisibility(undefined)).toBe(false);
  });
});

describe('learning-item-kind vocabulary', () => {
  it('exposes exactly the five approved kinds', () => {
    expect([...LEARNING_ITEM_KINDS]).toEqual([
      'VOCABULARY',
      'CHARACTER',
      'GRAMMAR',
      'EXAMPLE',
      'MEDIA_REFERENCE',
    ]);
  });

  it('guards unknown kinds', () => {
    expect(isLearningItemKind('VOCABULARY')).toBe(true);
    expect(isLearningItemKind('SENTENCE')).toBe(false);
  });
});

describe('ordering validation', () => {
  it('accepts non-negative integers (including 0)', () => {
    expect(validatePosition(0)).toBe(0);
    expect(validatePosition(7)).toBe(7);
  });

  it.each([-1, 1.5, Number.NaN, '3', null, undefined])(
    'rejects a non non-negative-integer position (%p)',
    (value) => {
      expect(() => validatePosition(value)).toThrow(ContentValidationError);
    },
  );

  it('accepts and trims a valid title', () => {
    expect(validateTitle('  Greetings  ')).toBe('Greetings');
  });

  it('rejects an empty/oversized title', () => {
    expect(() => validateTitle('   ')).toThrow(ContentValidationError);
    expect(() => validateTitle('x'.repeat(TITLE_MAX_LENGTH + 1))).toThrow(ContentValidationError);
  });

  it('accepts a well-formed slug and rejects malformed ones', () => {
    expect(validateSlug('hsk-1-greetings')).toBe('hsk-1-greetings');
    expect(() => validateSlug('Bad Slug')).toThrow(ContentValidationError);
    expect(() => validateSlug('trailing-')).toThrow(ContentValidationError);
    expect(() => validateSlug('')).toThrow(ContentValidationError);
    expect(() => validateSlug('x'.repeat(SLUG_MAX_LENGTH + 1))).toThrow(ContentValidationError);
  });

  it('normalizes an empty/whitespace description to null', () => {
    expect(validateDescription(undefined)).toBeNull();
    expect(validateDescription('   ')).toBeNull();
    expect(validateDescription('  about  ')).toBe('about');
  });
});

describe('hierarchy node', () => {
  it('defaults visibility to DRAFT and position to 0', () => {
    const node = makeHierarchyNode({
      publicId: '11111111-1111-4111-8111-111111111111',
      authorId: 'teacher-1',
      slug: 'greetings',
      title: 'Greetings',
    });
    expect(node.visibility).toBe('DRAFT');
    expect(node.position).toBe(0);
    expect(node.description).toBeNull();
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('rejects an invalid visibility', () => {
    expect(() =>
      makeHierarchyNode({
        publicId: '11111111-1111-4111-8111-111111111111',
        authorId: 'teacher-1',
        slug: 'greetings',
        title: 'Greetings',
        visibility: 'PRIVATE',
      }),
    ).toThrow(ContentValidationError);
  });
});

describe('learning item Chinese-field contracts by kind', () => {
  const base = { publicId: '22222222-2222-4222-8222-222222222222', authorId: 'teacher-1' };

  it('VOCABULARY requires simplified + pinyin + meaning', () => {
    const item = makeLearningItem({
      ...base,
      kind: 'VOCABULARY',
      simplified: '你好',
      traditional: '你好',
      pinyin: 'nǐ hǎo',
      meaning: 'hello',
      hskLevel: 1,
    });
    expect(item.kind).toBe('VOCABULARY');
    expect(item.simplified).toBe('你好');
    expect(item.traditional).toBe('你好');
    expect(item.pinyin).toBe('nǐ hǎo');
    expect(item.meaning).toBe('hello');
    expect(item.hskLevel).toBe(1);
  });

  it('VOCABULARY without pinyin is rejected (no generic term/definition)', () => {
    expect(() =>
      makeLearningItem({ ...base, kind: 'VOCABULARY', simplified: '你好', meaning: 'hello' }),
    ).toThrow(ContentValidationError);
  });

  it('CHARACTER requires simplified + pinyin + meaning', () => {
    expect(() => makeLearningItem({ ...base, kind: 'CHARACTER', simplified: '好' })).toThrow(
      ContentValidationError,
    );
  });

  it('GRAMMAR requires simplified + meaning but pinyin is optional', () => {
    const item = makeLearningItem({
      ...base,
      kind: 'GRAMMAR',
      simplified: '把字句',
      meaning: 'ba-construction',
    });
    expect(item.pinyin).toBeNull();
  });

  it('EXAMPLE requires Chinese text + meaning', () => {
    const item = makeLearningItem({
      ...base,
      kind: 'EXAMPLE',
      simplified: '我很好。',
      meaning: 'I am fine.',
    });
    expect(item.kind).toBe('EXAMPLE');
  });

  it('MEDIA_REFERENCE requires a structured reference and stores no media', () => {
    const item = makeLearningItem({
      ...base,
      kind: 'MEDIA_REFERENCE',
      reference: { provider: 'external', url: 'https://example.invalid/audio/ni.mp3' },
    });
    expect(item.simplified).toBeNull();
    expect(item.reference).toEqual({
      provider: 'external',
      url: 'https://example.invalid/audio/ni.mp3',
    });
  });

  it('MEDIA_REFERENCE without a reference is rejected', () => {
    expect(() => makeLearningItem({ ...base, kind: 'MEDIA_REFERENCE' })).toThrow(
      ContentValidationError,
    );
  });

  it('rejects an unknown kind', () => {
    expect(() => makeLearningItem({ ...base, kind: 'SENTENCE' })).toThrow(ContentValidationError);
  });

  it('validates the HSK band bound', () => {
    expect(validateHskLevel(undefined)).toBeNull();
    expect(validateHskLevel(HSK_MIN_LEVEL)).toBe(HSK_MIN_LEVEL);
    expect(validateHskLevel(HSK_MAX_LEVEL)).toBe(HSK_MAX_LEVEL);
    expect(() => validateHskLevel(0)).toThrow(ContentValidationError);
    expect(() => validateHskLevel(HSK_MAX_LEVEL + 1)).toThrow(ContentValidationError);
    expect(() => validateHskLevel('3')).toThrow(ContentValidationError);
  });

  it('rejects a non-object reference', () => {
    expect(() =>
      makeLearningItem({ ...base, kind: 'MEDIA_REFERENCE', reference: ['not', 'object'] }),
    ).toThrow(ContentValidationError);
  });
});

describe('content read visibility policy', () => {
  it('lets students read only PUBLISHED content', () => {
    expect(canReadContent('PUBLISHED', ['STUDENT'])).toBe(true);
    expect(canReadContent('DRAFT', ['STUDENT'])).toBe(false);
  });

  it('lets anonymous callers read only PUBLISHED content', () => {
    expect(canReadContent('PUBLISHED', [])).toBe(true);
    expect(canReadContent('DRAFT', [])).toBe(false);
  });

  it('lets teachers/admins read DRAFT content', () => {
    expect(canReadContent('DRAFT', ['TEACHER'])).toBe(true);
    expect(canReadContent('DRAFT', ['ADMIN'])).toBe(true);
  });

  it('filters a mixed list for a student', () => {
    const nodes = [
      { id: 'a', visibility: 'DRAFT' as const },
      { id: 'b', visibility: 'PUBLISHED' as const },
    ];
    expect(filterReadable(nodes, ['STUDENT']).map((n) => n.id)).toEqual(['b']);
    expect(filterReadable(nodes, ['ADMIN']).map((n) => n.id)).toEqual(['a', 'b']);
  });
});
