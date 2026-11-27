import { createHash } from 'node:crypto';

export const PARSER_VERSION = 'dict-import-v1';
export const NORMALIZER_VERSION = 'dict-nfc-whitespace-v1';
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
export const CONTENT_TYPES = ['WORD', 'TERM', 'PHRASE', 'SENTENCE', 'UNCLASSIFIED'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export class DictionaryError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function invalid(message = 'Dữ liệu từ điển chưa hợp lệ.'): never {
  throw new DictionaryError(400, 'DICTIONARY_INVALID', message);
}
export function canonical(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u200b\ufeff]/g, '')
    .trim()
    .replace(/\s+/gu, ' ');
}
/** Search-only normalization. Never used to merge identities or evaluate answers. */
export function searchKey(value: string): string {
  return canonical(value)
    .replace(/[üǖǘǚǜ]/giu, 'v')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase();
}
export function compact(value: string): string {
  return searchKey(value).replace(/[\s'’\-]/gu, '');
}
export function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  )
    invalid();
  return value;
}
export interface ImportRow {
  ordinal: number;
  raw: unknown;
  fields: [string, string, string, string] | null;
  categories: number[];
  flags: string[];
}
export interface ImportDocument {
  checksum: string;
  categories: Array<{ label: string; url: string }>;
  rows: ImportRow[];
  declaredCounts: number[] | null;
  summary: Record<string, number>;
}

function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    endedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (endedQuote && ![',', '\r', '\n'].includes(char)) invalid('Cấu trúc CSV chưa hợp lệ.');
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        endedQuote = true;
      } else if (field !== '') invalid('Cấu trúc CSV chưa hợp lệ.');
      else quoted = true;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
      endedQuote = false;
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      endedQuote = false;
    } else field += char;
  }
  if (quoted) invalid('CSV có trường chưa đóng dấu ngoặc kép.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Linear scan over bounded input; unmatched script tags cannot cause repeated whole-file scans. */
function htmlData(text: string): string {
  const lower = text.toLowerCase();
  let position = 0;
  const blocks: string[] = [];
  while (position < text.length) {
    const start = lower.indexOf('<script', position);
    if (start < 0) break;
    if (!/[\s>]/u.test(text[start + 7] || '')) {
      position = start + 7;
      continue;
    }
    const openEnd = lower.indexOf('>', start + 7);
    if (openEnd < 0 || openEnd - start > 8192) invalid('Thẻ dữ liệu HTML chưa hợp lệ.');
    const close = lower.indexOf('</script', openEnd + 1);
    if (close < 0) invalid('Thẻ dữ liệu HTML chưa đóng.');
    const closeEnd = lower.indexOf('>', close + 8);
    if (closeEnd < 0 || !/^<\/script\s*>$/iu.test(text.slice(close, closeEnd + 1))) invalid();
    const attrs = [...text.slice(start + 7, openEnd).matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gu)];
    if (attrs.some((a) => a[1].toLowerCase() === 'id' && a[3] === 'data')) {
      if (
        attrs.filter((a) => a[1].toLowerCase() === 'id').length !== 1 ||
        !attrs.some(
          (a) => a[1].toLowerCase() === 'type' && a[3].toLowerCase() === 'application/json',
        )
      )
        invalid();
      blocks.push(text.slice(openEnd + 1, close));
    }
    position = closeEnd + 1;
  }
  if (blocks.length !== 1) invalid('Tệp HTML phải có đúng một khối dữ liệu JSON hợp lệ.');
  return blocks[0];
}

export function parseImport(bytes: Buffer, format: string): ImportDocument {
  if (!bytes.length || bytes.length > MAX_IMPORT_BYTES)
    throw new DictionaryError(
      413,
      'DICTIONARY_FILE_SIZE',
      'Tệp phải có dung lượng không quá 16 MB.',
    );
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\ufeff/u, '');
  } catch {
    return invalid('Tệp phải sử dụng mã hóa UTF-8.');
  }
  let input: unknown;
  try {
    if (format === 'html') {
      input = JSON.parse(htmlData(text));
    } else if (format === 'json') input = JSON.parse(text);
    else if (format === 'csv') {
      const table = csv(text);
      if (table.shift()?.join(',') !== 'chinese,pinyin,english,vietnamese,category,sourceUrl')
        invalid('CSV cần các cột: chinese,pinyin,english,vietnamese,category,sourceUrl.');
      const cats: string[] = [],
        sources: string[] = [];
      input = {
        cats,
        sources,
        entries: table.map((r) => {
          if (r.length !== 6) return r;
          let i = cats.findIndex((c, j) => c === r[4] && sources[j] === r[5]);
          if (i < 0) {
            i = cats.length;
            cats.push(r[4]);
            sources.push(r[5]);
          }
          return [...r.slice(0, 4), [i]];
        }),
      };
    } else invalid('Định dạng nhập chưa được hỗ trợ.');
  } catch (error) {
    if (error instanceof DictionaryError) throw error;
    return invalid('Không đọc được dữ liệu trong tệp.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const data = input as Record<string, unknown>;
  const { cats, sources, entries } = data;
  if (
    !Array.isArray(cats) ||
    !Array.isArray(sources) ||
    !Array.isArray(entries) ||
    cats.length !== sources.length ||
    !cats.length ||
    cats.length > 1000 ||
    entries.length > 100000
  )
    invalid();
  const declaredCounts = data.counts === undefined ? null : data.counts;
  if (
    declaredCounts !== null &&
    (!Array.isArray(declaredCounts) ||
      declaredCounts.length !== cats.length ||
      declaredCounts.some((v) => !Number.isInteger(v) || Number(v) < 0))
  )
    invalid();
  const categories = cats.map((label, i) => {
    if (
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 200 ||
      typeof sources[i] !== 'string'
    )
      invalid();
    try {
      const url = new URL(sources[i]);
      if (url.protocol !== 'https:' || url.username || url.password || sources[i].length > 2000)
        invalid();
    } catch {
      invalid('Đường dẫn nguồn phải là HTTPS và không chứa thông tin đăng nhập.');
    }
    return { label: canonical(label), url: sources[i] as string };
  });
  const rawSeen = new Set<string>(),
    cleanSeen = new Set<string>(),
    headwords = new Set<string>();
  let rejected = 0,
    exactDuplicates = 0,
    missingEnglish = 0,
    changed = 0;
  const rows = entries.map((raw, ordinal): ImportRow => {
    const flags: string[] = [];
    const result: ImportRow = { ordinal: ordinal + 1, raw, fields: null, categories: [], flags };
    try {
      if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > 64000)
        invalid('Một dòng dữ liệu vượt giới hạn cho phép.');
    } catch (error) {
      if (error instanceof DictionaryError) throw error;
      invalid('Cấu trúc dòng dữ liệu quá phức tạp.');
    }
    if (
      !Array.isArray(raw) ||
      raw.length !== 5 ||
      !raw.slice(0, 4).every((v) => typeof v === 'string') ||
      !Array.isArray(raw[4]) ||
      !raw[4].length ||
      raw[4].some(
        (v: unknown) => !Number.isInteger(v) || Number(v) < 0 || Number(v) >= categories.length,
      )
    ) {
      flags.push('INVALID_ROW');
      rejected++;
      return result;
    }
    const values = raw.slice(0, 4) as string[];
    const limits = [2000, 4000, 8000, 8000];
    if (
      values.some(
        (v, i) =>
          [...v].length > limits[i] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v),
      )
    ) {
      flags.push('INVALID_TEXT');
      rejected++;
      return result;
    }
    const fields = values.map(canonical) as ImportRow['fields'];
    if (!fields![0]) {
      flags.push('MISSING_CHINESE');
      rejected++;
      return result;
    }
    if (!fields![1]) flags.push('MISSING_PINYIN');
    if (!fields![2]) {
      flags.push('MISSING_ENGLISH');
      missingEnglish++;
    }
    if (!fields![3]) flags.push('MISSING_VIETNAMESE');
    if (values.some((v, i) => v !== fields![i])) {
      flags.push('NORMALIZED');
      changed++;
    }
    const rawId = JSON.stringify(values),
      key = JSON.stringify(fields);
    if (rawSeen.has(rawId)) exactDuplicates++;
    rawSeen.add(rawId);
    cleanSeen.add(key);
    headwords.add(JSON.stringify(fields!.slice(0, 2)));
    return { ...result, fields, categories: [...new Set<number>(raw[4])], flags };
  });
  return {
    checksum: hash(bytes),
    categories,
    rows,
    declaredCounts: declaredCounts as number[] | null,
    summary: {
      inputRows: rows.length,
      validRows: rows.length - rejected,
      rejectedRows: rejected,
      exactDuplicates,
      canonicalDuplicates: rows.length - rejected - cleanSeen.size,
      candidateSenses: cleanSeen.size,
      candidateHeadwords: headwords.size,
      missingEnglish,
      normalizedRows: changed,
      sourceCategories: categories.length,
    },
  };
}
