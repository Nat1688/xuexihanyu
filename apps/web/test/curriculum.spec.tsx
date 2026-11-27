jest.mock('../src/config/public-config', () => ({ getPublicConfig: () => ({ apiBaseUrl: '' }) }));
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonContent } from '../src/curriculum/Lesson';
import { curriculumApi } from '../src/curriculum/api';
const lesson = {
  publicId: 'lesson',
  title: 'Chào hỏi',
  slug: 'lesson',
  description: 'Học cách chào hỏi',
  visibility: 'DRAFT',
  position: 0,
};
describe('CORE-01 curriculum', () => {
  afterEach(() => jest.restoreAllMocks());
  it('renders Chinese, Pinyin, Vietnamese and examples safely', () => {
    const html = renderToStaticMarkup(
      <LessonContent
        document={{
          lesson,
          items: [
            {
              kind: 'VOCABULARY',
              simplified: '你好',
              pinyin: 'nǐ hǎo',
              meaning: 'Xin chào',
              reference: { example: '<script>unsafe</script>' },
            },
          ],
        }}
      />,
    );
    for (const text of ['你好', 'nǐ hǎo', 'Xin chào', 'Chào hỏi']) expect(html).toContain(text);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('refuses executable media URLs and renders HTTPS audio with controls', () => {
    const html = renderToStaticMarkup(
      <LessonContent
        document={{
          lesson,
          items: [
            {
              kind: 'MEDIA_REFERENCE',
              simplified: null,
              pinyin: null,
              meaning: 'Âm thanh',
              reference: { type: 'audio', url: 'https://example.invalid/audio.mp3' },
            },
            {
              kind: 'MEDIA_REFERENCE',
              simplified: null,
              pinyin: null,
              meaning: 'Không an toàn',
              reference: { type: 'image', url: 'javascript:alert(1)' },
            },
          ],
        }}
      />,
    );
    expect(html).toContain('<audio');
    expect(html).toContain('controls');
    expect(html).not.toContain('javascript:');
  });
  it('saves through credentialed CSRF protected API and retains wire values', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'clp_csrf=synthetic' },
    });
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    await curriculumApi.save('unsafe/id', { lesson, items: [] }, 'PUBLISHED');
    expect(fetch.mock.calls[0][0]).toBe('/content/lessons/unsafe%2Fid/save');
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'synthetic' },
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).visibility).toBe('PUBLISHED');
  });
});
