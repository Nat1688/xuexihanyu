jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
jest.mock('../src/lesson-preview/LessonReader.css', () => ({}));
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonReader } from '../src/lesson-preview/LessonReader';
import { previewApi } from '../src/lesson-preview/client';
import { PreviewEntry } from '../src/lesson-preview/PreviewEntry';

describe('LC-03B reader initial state and client contract', () => {
  it('LC03C never advertises preview before server discovery', () => {
    expect(renderToStaticMarkup(<PreviewEntry onOpen={() => undefined} />)).toBe('');
  });
  it('shows preview, unsaved practice and separate instruction selector', () => {
    const html = renderToStaticMarkup(<LessonReader onBack={() => undefined} />);
    expect(html).toContain('PREVIEW_ONLY');
    expect(html).toContain('chưa lưu tiến độ');
    expect(html).toContain('instruction-language');
    expect(html).not.toContain('acceptedForms');
    expect(html).toContain('Back to Today');
  });
  it('pins revision and language on POST without mode or progress identifiers', async () => {
    const calls: { url: string; options: RequestInit }[] = [];
    const previous = global.fetch;
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: { cookie: '' }, configurable: true });
    global.fetch = jest.fn(async (url, options) => {
      calls.push({ url: String(url), options: options! });
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    try {
      await previewApi.read('en');
      await previewApi.read('vi', 'pinned revision');
      await previewApi.availability();
      await previewApi.check({
        instructionLanguage: 'en',
        revision: 'rev-1',
        taskId: 'P5',
        answer: 'nǐ hǎo',
      });
      expect(calls[0].url).toContain('instructionLanguage=en');
      expect(calls[1].url).toContain('instructionLanguage=vi&revision=pinned%20revision');
      expect(calls[2].url).toContain('/availability');
      expect(JSON.parse(calls[3].options.body as string)).toEqual({
        instructionLanguage: 'en',
        revision: 'rev-1',
        taskId: 'P5',
        answer: 'nǐ hǎo',
      });
      expect(calls[3].options.credentials).toBe('include');
      expect(calls[3].options.cache).toBe('no-store');
    } finally {
      global.fetch = previous;
      if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });
});
