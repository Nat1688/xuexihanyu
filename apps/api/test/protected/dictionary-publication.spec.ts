import { publicationInput, sourceRightsInput } from '../../src/modules/dictionary/publication';
import { DictionaryError } from '../../src/modules/dictionary/domain';

describe('DICT07 explicit human publication intent', () => {
  const draft = {
    fingerprint: 'a'.repeat(64),
    action: 'PUBLISH',
    confirmed: true,
    contentReviewed: true,
    reviewReference: 'Synthetic specialist review reference only.',
  };
  it('accepts explicit reviewed scope without trusting client actor', () => {
    expect(publicationInput(draft)).toEqual({
      fingerprint: draft.fingerprint,
      action: 'PUBLISH',
      reference: draft.reviewReference,
    });
    expect(() => publicationInput({ ...draft, actorId: 'spoofed' })).toThrow(DictionaryError);
  });
  it.each([
    null,
    [],
    { ...draft, fingerprint: 'latest' },
    { ...draft, confirmed: false },
    { ...draft, contentReviewed: false },
    { ...draft, reviewReference: 'yes' },
    { ...draft, action: 'PUBLISHED' },
    { ...draft, action: ['PUBLISH'] },
    { ...draft, contentReviewed: 'true' },
    { ...draft, reviewReference: {} },
    { ...draft, reviewReference: 'x'.repeat(2001) },
  ])('rejects malformed or unreviewed action %#', (body) => {
    expect(() => publicationInput(body)).toThrow(DictionaryError);
  });
  it('allows unpublish without falsely claiming editorial verification', () => {
    expect(
      publicationInput({
        fingerprint: draft.fingerprint,
        action: 'UNPUBLISH',
        confirmed: true,
        contentReviewed: false,
        reviewReference: '',
      }).action,
    ).toBe('UNPUBLISH');
  });
  it('requires source evidence, confirmation and a known revision', () => {
    const source = {
      expectedRevision: 1,
      rights: 'CONFIRMED',
      confirmed: true,
      evidence: 'Synthetic right-to-use evidence for tests only.',
    };
    expect(sourceRightsInput(source).revision).toBe(1);
    for (const body of [
      { ...source, expectedRevision: 0 },
      { ...source, confirmed: false },
      { ...source, evidence: 'no' },
      { ...source, rights: 'PUBLISHED' },
      { ...source, actorId: 'spoofed' },
    ])
      expect(() => sourceRightsInput(body)).toThrow(DictionaryError);
  });
});
