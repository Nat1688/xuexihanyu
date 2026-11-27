import {
  canonical,
  compact,
  DictionaryError,
  hash,
  parseImport,
  searchKey,
} from '../../src/modules/dictionary/domain';
import { DictionaryRateLimiter, DictionaryService } from '../../src/modules/dictionary/service';
import { DictionaryRepository } from '../../src/modules/dictionary/repository';

const row = ['合同', 'hétóng', 'contract', 'hợp đồng', [0]];
const document = (entries: unknown[] = [row]) => ({
  cats: ['Nguồn kiểm thử'],
  sources: ['https://example.invalid/dictionary'],
  counts: [entries.length],
  entries,
});
const buffer = (entries?: unknown[]) => Buffer.from(JSON.stringify(document(entries)));
describe('DICT02 inert import and linguistic identity', () => {
  it('rejects thousands of unmatched script openings without evaluating any script', () => {
    expect(() => parseImport(Buffer.from('<script>'.repeat(20000)), 'html')).toThrow(
      DictionaryError,
    );
  });
  it('refuses malformed quoted CSV rather than silently rewriting its meaning', () => {
    expect(() =>
      parseImport(
        Buffer.from(
          'chinese,pinyin,english,vietnamese,category,sourceUrl\n"a"b,c,d,e,f,https://example.invalid/',
        ),
        'csv',
      ),
    ).toThrow(DictionaryError);
  });
  it('reads JSON without executing other HTML scripts', () => {
    const html = `<script>throw new Error('never execute')</script><script id="data" type="application/json">${buffer()}</script>`;
    expect(parseImport(Buffer.from(html), 'html').summary.validRows).toBe(1);
  });
  it.each([
    '<script id="data" type="application/json">alert(1)</script>',
    '<script>const entries=[]</script>',
    '<script id="data" type="application/json">{}</script><script id="data" type="application/json">{}</script>',
  ])('rejects non-JSON and ambiguous HTML', (input) =>
    expect(() => parseImport(Buffer.from(input), 'html')).toThrow(DictionaryError),
  );
  it('reconciles malformed rows and preserves valid incomplete translations', () => {
    const result = parseImport(buffer([row, ['bad'], ['行', 'háng', '', 'hàng', [0]]]), 'json');
    expect(result.summary).toMatchObject({
      inputRows: 3,
      validRows: 2,
      rejectedRows: 1,
      missingEnglish: 1,
    });
    expect(result.rows[2].fields?.[2]).toBe('');
  });
  it('does not merge homographs, pronunciation or translation alternatives', () => {
    const result = parseImport(
      buffer([
        row,
        ['合同', 'hé tong', 'agreement', 'hợp đồng', [0]],
        ['合同', 'hétóng', 'contract', 'thỏa thuận', [0]],
      ]),
      'json',
    );
    expect(result.summary.candidateSenses).toBe(3);
    expect(result.summary.candidateHeadwords).toBe(2);
  });
  it('keeps raw invisible characters but detects canonical duplicates', () => {
    const result = parseImport(
      buffer([row, ['合同\u200b', 'hétóng', 'contract', 'hợp đồng', [0]]]),
      'json',
    );
    expect(result.summary.canonicalDuplicates).toBe(1);
    expect(result.rows[1].raw).toEqual(['合同\u200b', 'hétóng', 'contract', 'hợp đồng', [0]]);
  });
  it('rejects invalid encoding, oversized payload and category metadata', () => {
    expect(() => parseImport(Buffer.from([255]), 'json')).toThrow(DictionaryError);
    expect(() => parseImport(Buffer.alloc(16 * 1024 * 1024 + 1), 'json')).toThrow(DictionaryError);
    expect(() =>
      parseImport(Buffer.from(JSON.stringify({ ...document(), sources: [] })), 'json'),
    ).toThrow(DictionaryError);
  });
  it('quarantines invalid category links/control characters', () => {
    expect(
      parseImport(
        buffer([
          ['a', 'b', 'c', 'd', [true]],
          ['a', 'b', 'c', 'd', [3]],
          ['a\u0000', 'b', 'c', 'd', [0]],
        ]),
        'json',
      ).summary.rejectedRows,
    ).toBe(3);
  });
  it('supports CSV quoted fields and rejects unknown schema', () => {
    const data =
      'chinese,pinyin,english,vietnamese,category,sourceUrl\r\n合同,hétóng,"contract, agreement",hợp đồng,Pháp lý,https://example.invalid/source';
    expect(parseImport(Buffer.from(data), 'csv').rows[0].fields?.[2]).toBe('contract, agreement');
    expect(() => parseImport(Buffer.from('wrong,header'), 'csv')).toThrow(DictionaryError);
  });
  it('separates search folding from stored originals and identity', () => {
    expect(searchKey('Hợp đồng')).toBe('hop dong');
    expect(compact('hé tóng')).toBe('hetong');
    expect(searchKey('nǚ')).toBe('nv');
    expect(searchKey('nu')).not.toBe(searchKey('nü'));
    expect(canonical(' 你好\u200b ')).toBe('你好');
    expect(hash('hétóng')).not.toBe(hash('hetong'));
  });
});
describe('DICT application boundaries', () => {
  const search = jest.fn(),
    write = jest.fn();
  const service = new DictionaryService({
    search,
    import: write,
  } as unknown as DictionaryRepository);
  beforeEach(() => {
    search.mockClear();
    write.mockClear();
  });
  it('dry run performs no repository writes', async () => {
    const result = await service.import(buffer(), 'json', 'synthetic.json', 'actor', true);
    expect(result).toMatchObject({ dryRun: true, dictionaryWrites: 0 });
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    { limit: '1000' },
    { sort: 'sql' },
    { q: ['a', 'b'] },
    { categoryId: '1' },
    { cursor: '!' },
    { authorId: 'forged' },
    { q: 'a'.repeat(121) },
  ])('rejects unbounded/unknown parameters before repository', (input) => {
    expect(() => service.search(input, false)).toThrow(DictionaryError);
    expect(search).not.toHaveBeenCalled();
  });
  it('rejects filesystem paths and credentials in source URLs', async () => {
    await expect(service.import(buffer(), 'json', '../secret', 'actor', false)).rejects.toThrow(
      DictionaryError,
    );
    const bad = { ...document(), sources: ['https://user:credential@example.invalid/'] };
    expect(() => parseImport(Buffer.from(JSON.stringify(bad)), 'json')).toThrow(DictionaryError);
  });
  it('rate limits imports independently per account', () => {
    const limiter = new DictionaryRateLimiter();
    limiter.check('a', 'import');
    limiter.check('a', 'import');
    expect(() => limiter.check('a', 'import')).toThrow(DictionaryError);
    expect(() => limiter.check('b', 'import')).not.toThrow();
  });
});
