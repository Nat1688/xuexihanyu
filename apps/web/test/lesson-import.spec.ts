import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyLessonImport,
  exportLessonJson,
  IMPORT_MAX_BYTES,
  parseLessonFile,
} from '../src/curriculum/lesson-import';
import type { LessonDocument } from '../src/curriculum/api';

const vocabulary = {
  kind: 'VOCABULARY',
  simplified: '你好',
  pinyin: 'nǐ hǎo',
  meaning: 'Xin chào',
};
const source = (items: unknown[] = [vocabulary], extra = {}) =>
  JSON.stringify({ title: 'Chào hỏi', description: 'Giải thích', items, ...extra });
const current: LessonDocument = {
  revision: 'server-revision',
  lesson: {
    publicId: 'existing',
    title: 'Bài đang soạn',
    slug: 'existing',
    position: 7,
    visibility: 'DRAFT',
    description: 'Giữ nội dung',
  },
  items: [{ ...vocabulary, publicId: 'previous-item' }],
};

describe('IMPORT-01 file validation and preserving existing lessons', () => {
  it.each(['json', 'csv'])('parses the downloadable %s template in UTF-8', (extension) => {
    const template = readFileSync(
      join(__dirname, '../public/templates/bai-hoc-mau.' + extension),
      'utf8',
    );
    const lesson = parseLessonFile('mau.' + extension, template);
    expect(lesson.title).toBe('Bài 1 — Chào hỏi');
    expect(lesson.items).toHaveLength(2);
    expect(lesson.items[0]).toMatchObject(vocabulary);
    expect(lesson.items[1].kind).toBe('GRAMMAR');
  });
  it('reads BOM, CRLF, commas, escaped quotes and multiline CSV fields', () => {
    const csv =
      '\uFEFFkind,simplified,pinyin,meaning,example\r\nVOCABULARY,你好,nǐ hǎo,"Xin chào, bạn","Dòng 1\r\nDòng 2 ""chào"""\r\n';
    expect(parseLessonFile('bai.CSV', csv).items[0]).toMatchObject({
      meaning: 'Xin chào, bạn',
      reference: { example: 'Dòng 1\r\nDòng 2 "chào"' },
    });
  });
  it('ships a BOM and Vietnamese Excel headers/values while preserving Chinese and Pinyin', () => {
    const bytes = readFileSync(join(__dirname, '../public/templates/bai-hoc-mau.csv'));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    expect(text).toContain('Tên bài học,Giới thiệu bài học,Loại nội dung');
    expect(text).toContain('Từ vựng,你好,nǐ hǎo,Xin chào');
    expect(text).not.toMatch(/VOCABULARY|GRAMMAR|mediaType|mediaUrl/);
    expect(parseLessonFile('mẫu.csv', text).items[0]).toMatchObject(vocabulary);
  });
  it('accepts Vietnamese item/media labels, NFC/trim/case aliases and semicolon-delimited Excel CSV', () => {
    const csv =
      '\uFEFFTên bài học;Loại nội dung;Chữ Hán / cấu trúc;Pinyin;Nghĩa tiếng Việt;Ví dụ sử dụng;Loại tài nguyên;Đường dẫn tài nguyên\r\nChào hỏi; TỪ VỰNG ;你好;nǐ hǎo;Xin chào;"Xin chào; bạn\r\nDòng 2 ""chào""";;\r\n;Hình ảnh / âm thanh;;;;;Âm thanh;https://example.invalid/a.mp3\r\n';
    const parsed = parseLessonFile('excel.csv', csv.normalize('NFD'));
    expect(parsed.items[0].kind).toBe('VOCABULARY');
    expect(parsed.items[0].simplified).toBe('你好');
    expect(parsed.items[0].reference?.example).toContain(';');
    expect(parsed.items[1]).toMatchObject({
      kind: 'MEDIA_REFERENCE',
      reference: { type: 'audio', url: 'https://example.invalid/a.mp3' },
    });
  });
  it('supports all five Vietnamese kinds and legacy English CSV field/value names', () => {
    for (const [kind, canonical] of [
      ['Từ vựng', 'VOCABULARY'],
      ['Chữ Hán', 'CHARACTER'],
      ['Ngữ pháp', 'GRAMMAR'],
      ['Ví dụ / hội thoại', 'EXAMPLE'],
      ['Hình ảnh / âm thanh', 'MEDIA_REFERENCE'],
    ]) {
      const csv = `Loại nội dung,Chữ Hán / cấu trúc,Pinyin,Nghĩa tiếng Việt,Loại tài nguyên,Đường dẫn tài nguyên\n${kind},你好,nǐ hǎo,Xin chào${canonical === 'MEDIA_REFERENCE' ? ',Hình ảnh,https://example.invalid/a.png' : ',,'}`;
      expect(parseLessonFile('mới.csv', csv).items[0].kind).toBe(canonical);
    }
    const old =
      'title,description,kind,simplified,pinyin,meaning,example,mediaType,mediaUrl\nChào hỏi,Giới thiệu,VOCABULARY,你好,nǐ hǎo,Xin chào,,,\n';
    expect(parseLessonFile('old.csv', old).items[0]).toMatchObject(vocabulary);
  });
  it('rejects bilingual duplicate aliases, unknown translated labels and unsupported media values', () => {
    expect(() => parseLessonFile('x.csv', 'kind,Loại nội dung\nVOCABULARY,Từ vựng')).toThrow(
      'bị trùng',
    );
    expect(() => parseLessonFile('x.csv', 'Loại nội dung,Trường lạ\nTừ vựng,x')).toThrow('Tên cột');
    expect(() =>
      parseLessonFile(
        'x.csv',
        'Loại nội dung,Chữ Hán / cấu trúc,Pinyin,Nghĩa tiếng Việt\nLoại lạ,你好,nǐ hǎo,Xin chào',
      ),
    ).toThrow('Loại nội dung');
    expect(() =>
      parseLessonFile(
        'x.csv',
        'Loại nội dung,Loại tài nguyên,Đường dẫn tài nguyên\nHình ảnh / âm thanh,Video,https://example.invalid/a.mp4',
      ),
    ).toThrow('image hoặc audio');
    expect(() =>
      parseLessonFile(
        'x.csv',
        'Loại nội dung,Loại tài nguyên,Đường dẫn tài nguyên\nHình ảnh / âm thanh,Hình ảnh,javascript:alert(1)',
      ),
    ).toThrow('HTTPS');
  });
  it('accepts all five kinds and HTTPS image/audio references', () => {
    const items = [
      vocabulary,
      { ...vocabulary, kind: 'CHARACTER' },
      { kind: 'GRAMMAR', simplified: '我叫……', meaning: 'Tôi tên là' },
      { kind: 'EXAMPLE', simplified: '你好！', meaning: 'Xin chào!' },
      {
        kind: 'MEDIA_REFERENCE',
        reference: { type: 'audio', url: 'https://example.invalid/audio.mp3' },
      },
    ];
    expect(parseLessonFile('x.json', source(items)).items).toHaveLength(5);
    expect(
      parseLessonFile(
        'x.csv',
        'kind,mediaType,mediaUrl\nMEDIA_REFERENCE,image,https://example.invalid/a.png',
      ).items[0].reference?.type,
    ).toBe('image');
  });
  it.each([
    ['bad.json', '{'],
    ['bad.json', '[]'],
    ['bad.html', '<script>alert(1)</script>'],
    ['bad.json', source([])],
    ['bad.json', source(Array(101).fill(vocabulary))],
    ['bad.json', source([{ ...vocabulary, simplified: '' }])],
    ['bad.json', source([{ ...vocabulary, pinyin: '' }])],
    ['bad.json', source([{ ...vocabulary, meaning: 'a'.repeat(201) }])],
    ['bad.json', source([{ ...vocabulary, kind: 'UNKNOWN' }])],
    ['bad.json', source([{ ...vocabulary, publicId: 'forged' }])],
    ['bad.json', source([vocabulary], { revision: 'forged' })],
    ['bad.json', source([vocabulary], { title: null })],
    [
      'bad.json',
      source([
        { kind: 'MEDIA_REFERENCE', reference: { type: 'audio', url: 'javascript:alert(1)' } },
      ]),
    ],
    [
      'bad.json',
      source([
        {
          kind: 'MEDIA_REFERENCE',
          reference: { type: 'image', url: 'https://user:pass@example.invalid/a' },
        },
      ]),
    ],
    ['bad.json', source([{ ...vocabulary, hskLevel: 10 }])],
    ['bad.json', source([{ ...vocabulary, reference: { example: {} } }])],
    ['bad.csv', 'kind,kind\nVOCABULARY,VOCABULARY'],
    ['bad.csv', 'kind,unknown\nVOCABULARY,abc'],
    ['bad.csv', 'kind,simplified\nVOCABULARY'],
    ['bad.csv', 'kind,simplified\nVOCABULARY,"not closed'],
    ['bad.csv', 'kind,simplified\nVOCABULARY,"你好"oops'],
    ['bad.csv', 'title,kind,simplified,meaning\nA,GRAMMAR,一,một\nB,GRAMMAR,二,hai'],
  ])(
    'rejects malformed/untrusted input %# without modifying the current document',
    (filename, content) => {
      const before = JSON.stringify(current);
      expect(() => parseLessonFile(filename, content)).toThrow();
      expect(JSON.stringify(current)).toBe(before);
    },
  );
  it('enforces byte size for multibyte Chinese and invalid UTF-8', () => {
    expect(() => parseLessonFile('x.json', '你'.repeat(IMPORT_MAX_BYTES / 2))).toThrow('64 KiB');
    expect(() => parseLessonFile('x.json', source([vocabulary], { title: '\uFFFD' }))).toThrow(
      'UTF-8',
    );
  });
  it('appends while keeping identities, revision, lesson metadata and existing item references', () => {
    const next = applyLessonImport(current, parseLessonFile('x.json', source()), 'append');
    expect(next.revision).toBe(current.revision);
    expect(next.lesson).toBe(current.lesson);
    expect(next.items[0]).toBe(current.items[0]);
    expect(next.items).toHaveLength(2);
    expect(next.items[1].publicId).toBeUndefined();
    expect(current.items).toHaveLength(1);
  });
  it('replaces content and supplied metadata while keeping revision/ID/slug/visibility/position', () => {
    const next = applyLessonImport(current, parseLessonFile('x.json', source()), 'replace');
    expect(next.revision).toBe('server-revision');
    expect(next.lesson).toEqual({
      ...current.lesson,
      title: 'Chào hỏi',
      description: 'Giải thích',
    });
    expect(next.items).toHaveLength(1);
    expect(current.lesson.title).toBe('Bài đang soạn');
    const missingMetadata = parseLessonFile('x.json', JSON.stringify({ items: [vocabulary] }));
    expect(applyLessonImport(current, missingMetadata, 'replace').lesson).toEqual(current.lesson);
  });
  it('rejects overflow after append even if the input file itself is valid', () => {
    expect(() =>
      applyLessonImport(
        { ...current, items: Array(100).fill(current.items[0]) },
        parseLessonFile('x.json', source()),
        'append',
      ),
    ).toThrow('100 mục');
  });
  it('exports editable JSON without identities or session/revision metadata', () => {
    const saved = exportLessonJson(current);
    expect(saved).not.toContain('previous-item');
    expect(saved).not.toContain('server-revision');
    const restored = parseLessonFile('bai-hoc.json', saved);
    expect(restored.title).toBe(current.lesson.title);
    expect(restored.items).toEqual([vocabulary]);
  });
  it('blocks downloads that could not be imported again and rejects non-string media types', () => {
    expect(() => exportLessonJson({ ...current, items: [] })).toThrow('1 đến 100');
    expect(() => exportLessonJson({ ...current, items: [{ ...vocabulary, pinyin: '' }] })).toThrow(
      'Pinyin',
    );
    expect(() =>
      exportLessonJson({
        ...current,
        items: [{ ...vocabulary, reference: { provider: 'external' } }],
      }),
    ).toThrow('provider');
    expect(() =>
      parseLessonFile(
        'x.json',
        source([
          {
            kind: 'MEDIA_REFERENCE',
            reference: { type: ['audio'], url: 'https://example.invalid/a.mp3' },
          },
        ]),
      ),
    ).toThrow('image hoặc audio');
  });
});
