import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { loadServerConfig } from '../../src/config/config.loader';
import { rawCatalog } from '../../src/modules/lesson-preview/catalog-data';
import { CONTENT_MANIFEST, validateCatalog } from '../../src/modules/lesson-preview/catalog';
import { PreviewService, previewEnabled } from '../../src/modules/lesson-preview/preview.service';
import { makeEnv } from '../support/factories';

const env = makeEnv({
  overrides: {
    NODE_ENV: 'development',
    API_PORT: '3108',
    SPA_ORIGIN: 'http://127.0.0.1:5198',
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PORT: '55438',
    POSTGRES_DB: 'clp_lc03b_test',
    LC03B_PREVIEW_ENABLED: 'true',
  },
});
const config = loadServerConfig(env);
const body = {
  instructionLanguage: 'vi',
  revision: CONTENT_MANIFEST.revision,
  taskId: 'P1',
  answer: '你好',
};
const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
function status(operation: () => unknown, expected: number) {
  try {
    operation();
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(expected);
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('expected');
  }
}
describe('LC-03B catalog and stateless contracts', () => {
  it('denies a config-only target without database identity verification', () => {
    status(() => new PreviewService(config, false).read({ instructionLanguage: 'vi' }), 404);
  });
  it('retains pinned policy when a newer revision becomes current', () => {
    const previous = validateCatalog(rawCatalog, CONTENT_MANIFEST.sha256);
    const next = JSON.parse(JSON.stringify(rawCatalog));
    next.revision = 'next-preview';
    next.tasks[2].expected = 'different';
    const newer = validateCatalog(next, digest(next));
    const s = new PreviewService(config, true, [previous, newer]);
    expect(s.read({ instructionLanguage: 'en' }).revision).toBe('next-preview');
    expect(s.read({ instructionLanguage: 'vi', revision: previous.revision }).revision).toBe(
      previous.revision,
    );
    expect(s.check({ ...body, taskId: 'P5', answer: 'nǐ hǎo' }).correct).toBe(true);
    expect(
      s.check({ ...body, revision: 'next-preview', taskId: 'P5', answer: 'nǐ hǎo' }).correct,
    ).toBe(false);
    status(() => new PreviewService(config, true, [newer]).check(body), 404);
  });
  it('validates actual product revision and manifest, preview only', () => {
    expect(digest(rawCatalog)).toBe(CONTENT_MANIFEST.sha256);
    expect(validateCatalog(rawCatalog, CONTENT_MANIFEST.sha256).status).toBe('PREVIEW_ONLY');
  });
  it.each(['status', 'duplicate', 'reference', 'language', 'block', 'policy', 'digest'])(
    'rejects invalid catalog %s',
    (kind) => {
      const c = JSON.parse(JSON.stringify(rawCatalog));
      if (kind === 'status') c.status = 'PUBLISHED';
      if (kind === 'duplicate') c.concepts[1].id = c.concepts[0].id;
      if (kind === 'reference') c.tasks[0].conceptId = 'unknown';
      if (kind === 'language') c.variants[1].language = 'vi';
      if (kind === 'block') c.variants[0].blocks[0].kind = 'html';
      if (kind === 'policy') delete c.tasks[0].expected;
      expect(() => validateCatalog(c, kind === 'digest' ? 'wrong' : digest(c))).toThrow();
    },
  );
  it.each([
    { LC03B_PREVIEW_ENABLED: undefined },
    { LC03B_PREVIEW_ENABLED: 'false' },
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { POSTGRES_DB: 'clp_dev' },
    { POSTGRES_PORT: '55435' },
    { POSTGRES_HOST: '192.168.1.2' },
    { API_PORT: '3102' },
    { SPA_ORIGIN: 'http://127.0.0.1:5189' },
  ])('server gate fails closed %j', (overrides) => {
    const c = loadServerConfig({ ...env, ...overrides });
    expect(previewEnabled(c)).toBe(false);
    const service = new PreviewService(c, true);
    status(() => service.read({ instructionLanguage: 'vi' }), 404);
    status(() => service.check(body), 404);
  });
  it('does not expose flag via UI or accept bad config', () => {
    expect(loadServerConfig(makeEnv()).LC03B_PREVIEW_ENABLED).toBeUndefined();
    expect(() => loadServerConfig({ ...env, LC03B_PREVIEW_ENABLED: 'yes' })).toThrow();
  });
  it.each(['vi', 'en'])('learner allow-list and shared concepts %s', (instructionLanguage) => {
    const service = new PreviewService(config, true);
    const view = service.read({ instructionLanguage });
    expect(view.recordsProgress).toBe(false);
    expect(view.status).toBe('PREVIEW_ONLY');
    expect(view.concepts).toHaveLength(11);
    expect(view.dialogue).toHaveLength(7);
    expect(view.practices.map((x) => Object.keys(x).sort())).toEqual(
      Array(3).fill(['format', 'options', 'prompt', 'taskId']),
    );
    for (const forbidden of [
      'expected',
      'acceptedForms',
      'sha256',
      'specialistSignoff',
      'correct',
      'incorrect',
    ])
      expect(JSON.stringify(view)).not.toContain('"' + forbidden + '":');
    expect(view.practices[0].options).toEqual(['学生', '你好', '再见']);
    expect(view.concepts[0].id).toBe('greeting');
    expect(view.instructionLanguage).toBe(instructionLanguage);
  });
  it('pins revision and never falls back for unknown or retired revision', () => {
    const service = new PreviewService(config, true);
    const v = service.read({ instructionLanguage: 'vi' });
    expect(service.read({ instructionLanguage: 'en', revision: v.revision }).revision).toBe(
      v.revision,
    );
    for (const revision of ['old', 'future', '../../catalog']) {
      status(() => service.read({ instructionLanguage: 'vi', revision }), 404);
      status(() => service.check({ ...body, revision }), 404);
    }
  });
  it.each([
    { instructionLanguage: 'fr' },
    { instructionLanguage: ['vi', 'en'] },
    { instructionLanguage: 'vi', uiLocale: 'en' },
    { instructionLanguage: 'vi', actor: 'other' },
  ])('rejects unknown or malformed query %j', (query) =>
    status(() => new PreviewService(config, true).read(query), 400),
  );
  it.each([
    { ...body, answer: 42 },
    { ...body, answer: 'a'.repeat(201) },
    { ...body, expected: '你好' },
    { ...body, mode: 'VI_TO_ZH' },
    { ...body, actorId: 'other' },
    { ...body, answer: 'not-offered' },
  ])('rejects untrusted check fields %j', (input) =>
    status(() => new PreviewService(config, true).check(input), 400),
  );
  it.each(['vi', 'en'])('localized policies and no shared credit %s', (instructionLanguage) => {
    const s = new PreviewService(config, true);
    for (const [taskId, answer, correct] of [
      ['P1', '你好', true],
      ['P1', '再见', false],
      ['P3', ' 是 ', true],
      ['P3', '叫', false],
      ['P5', ' NǏ   HǍO ', true],
      ['P5', 'nǐ hǎo', true],
      ['P5', 'ní hǎo', false],
      ['P5', 'ni3 hao3', false],
      ['P5', 'ni hao', false],
    ] as const) {
      const result = s.check({ ...body, instructionLanguage, taskId, answer });
      expect(result.correct).toBe(correct);
      expect(result.recordsProgress).toBe(false);
      expect(result.instructionLanguage).toBe(instructionLanguage);
      expect(s.check({ ...body, instructionLanguage, taskId, answer })).toEqual(result);
    }
    status(() => s.check({ ...body, taskId: 'A1' }), 404);
  });
});
