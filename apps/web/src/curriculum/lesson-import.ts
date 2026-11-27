import type { LessonDocument, LessonItem } from './api';

export const IMPORT_MAX_BYTES = 64 * 1024;
export const LESSON_KIND_LABELS: Record<string, string> = {
  VOCABULARY: 'Từ vựng',
  CHARACTER: 'Chữ Hán',
  GRAMMAR: 'Ngữ pháp',
  EXAMPLE: 'Ví dụ / hội thoại',
  MEDIA_REFERENCE: 'Hình ảnh / âm thanh',
};
const kinds = Object.keys(LESSON_KIND_LABELS);
export const CSV_FIELD_GUIDE = [
  {
    key: 'title',
    label: 'Tên bài học',
    description: 'Điền ở dòng nội dung đầu tiên. Các dòng sau để trống.',
    example: 'Bài 1 — Chào hỏi',
  },
  {
    key: 'description',
    label: 'Giới thiệu bài học',
    description: 'Không bắt buộc. Điền một lần ở dòng đầu để giới thiệu mục tiêu bài.',
    example: 'Học cách chào hỏi và giới thiệu tên.',
  },
  {
    key: 'kind',
    label: 'Loại nội dung',
    description:
      'Bắt buộc. Điền một trong: Từ vựng, Chữ Hán, Ngữ pháp, Ví dụ / hội thoại, Hình ảnh / âm thanh.',
    example: 'Từ vựng',
  },
  {
    key: 'simplified',
    label: 'Chữ Hán / cấu trúc',
    description: 'Điền từ, chữ, cấu trúc ngữ pháp hoặc câu tiếng Trung. Bắt buộc với nội dung chữ.',
    example: '你好',
  },
  {
    key: 'pinyin',
    label: 'Pinyin',
    description:
      'Phiên âm có dấu thanh. Bắt buộc với Từ vựng và Chữ Hán; có thể bỏ trống với Ngữ pháp hoặc Ví dụ / hội thoại.',
    example: 'nǐ hǎo',
  },
  {
    key: 'meaning',
    label: 'Nghĩa tiếng Việt',
    description: 'Giải nghĩa hoặc dịch câu. Bắt buộc với nội dung chữ.',
    example: 'Xin chào',
  },
  {
    key: 'example',
    label: 'Ví dụ sử dụng',
    description: 'Không bắt buộc. Viết câu mẫu kèm bản dịch; có thể xuống dòng trong cùng một ô.',
    example: '你好！我叫小明。— Xin chào! Tôi tên là Tiểu Minh.',
  },
  {
    key: 'mediaType',
    label: 'Loại tài nguyên',
    description: 'Để trống với bài chỉ có chữ. Nếu thêm tài nguyên, điền Hình ảnh hoặc Âm thanh.',
    example: 'Hình ảnh',
  },
  {
    key: 'mediaUrl',
    label: 'Đường dẫn tài nguyên',
    description:
      'Để trống với bài chỉ có chữ. Với tài nguyên, dán liên kết HTTPS thật tới ảnh hoặc âm thanh, không phải đường dẫn trên máy tính.',
    example: 'Dán liên kết HTTPS của bạn tại đây; không chép dòng hướng dẫn này vào ô.',
  },
];
const normalizeLabel = (value: string) => value.trim().normalize('NFC').toLowerCase();
const columnAliases = new Map(
  CSV_FIELD_GUIDE.flatMap(({ key, label }) => [
    [normalizeLabel(key), key],
    [normalizeLabel(label), key],
  ]),
);
const kindAliases = new Map(
  Object.entries(LESSON_KIND_LABELS).flatMap(([key, label]) => [
    [normalizeLabel(key), key],
    [normalizeLabel(label), key],
  ]),
);
const mediaAliases = new Map([
  ['image', 'image'],
  ['hình ảnh', 'image'],
  ['audio', 'audio'],
  ['âm thanh', 'audio'],
]);
export interface ImportedLesson {
  title?: string;
  description?: string | null;
  items: LessonItem[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Cần một đối tượng JSON.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw Error(`Trường không được hỗ trợ: ${key}.`);
  }
}
function text(value: unknown, label: string, required = false, max = 200): string | null {
  if (value === undefined || value === null) {
    if (required) throw Error(`Thiếu ${label}.`);
    return null;
  }
  if (typeof value !== 'string') throw Error(`${label} phải là văn bản.`);
  const result = value.trim();
  if (required && !result) throw Error(`Thiếu ${label}.`);
  if (result.length > max) throw Error(`${label} tối đa ${max} ký tự.`);
  return result || null;
}
function item(value: unknown, index: number): LessonItem {
  try {
    const raw = object(value);
    keys(raw, ['kind', 'simplified', 'traditional', 'pinyin', 'meaning', 'hskLevel', 'reference']);
    if (typeof raw.kind !== 'string' || !kinds.includes(raw.kind))
      throw Error('Loại nội dung không hợp lệ.');
    const core = raw.kind !== 'MEDIA_REFERENCE';
    const result: LessonItem = {
      kind: raw.kind,
      simplified: text(raw.simplified, 'chữ Hán / cấu trúc', core),
      pinyin: text(raw.pinyin, 'Pinyin', ['VOCABULARY', 'CHARACTER'].includes(raw.kind)),
      meaning: text(raw.meaning, 'nghĩa tiếng Việt', core),
    };
    if (raw.traditional != null) result.traditional = text(raw.traditional, 'chữ phồn thể');
    if (raw.hskLevel != null) {
      if (
        typeof raw.hskLevel !== 'number' ||
        !Number.isInteger(raw.hskLevel) ||
        raw.hskLevel < 1 ||
        raw.hskLevel > 9
      )
        throw Error('HSK phải là số nguyên từ 1 đến 9.');
      result.hskLevel = raw.hskLevel;
    }
    if (raw.reference != null) {
      const ref = object(raw.reference);
      keys(ref, ['example', 'type', 'url']);
      result.reference = {};
      if (ref.example != null)
        result.reference.example = text(ref.example, 'ví dụ', false, IMPORT_MAX_BYTES);
      if (ref.type != null) result.reference.type = ref.type;
      if (ref.url != null) result.reference.url = ref.url;
    }
    if (
      raw.kind === 'MEDIA_REFERENCE' ||
      result.reference?.url != null ||
      result.reference?.type != null
    ) {
      const ref = result.reference;
      if (!ref || typeof ref.type !== 'string' || !['image', 'audio'].includes(ref.type))
        throw Error('Tài nguyên cần loại image hoặc audio.');
      const url = new URL(text(ref.url, 'đường dẫn HTTPS', true, 2048)!);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw Error('Tài nguyên cần đường dẫn HTTPS không chứa thông tin đăng nhập.');
      ref.url = url.href;
    }
    return result;
  } catch (error) {
    throw Error(
      `Mục ${index + 1}: ${error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.'}`,
    );
  }
}

// Strict CSV reader: commas, CRLF, quoted newlines and escaped double quotes.
function csvRows(source: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const endField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === separator) endField();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRow();
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw Error('CSV có dấu ngoặc kép không hợp lệ.');
      field += char;
    }
  }
  if (quoted) throw Error('CSV thiếu dấu ngoặc kép đóng.');
  endRow();
  return rows;
}

function csvSeparator(source: string): string {
  let quoted = false,
    commas = 0,
    semicolons = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n' || char === '\r') break;
      if (char === ',') commas++;
      if (char === ';') semicolons++;
    }
  }
  return semicolons > commas ? ';' : ',';
}

export function parseLessonFile(filename: string, source: string): ImportedLesson {
  if (new TextEncoder().encode(source).length > IMPORT_MAX_BYTES)
    throw Error('File tối đa 64 KiB.');
  source = source.replace(/^\uFEFF/, '');
  if (source.includes('\uFFFD')) throw Error('Hãy lưu file với mã hóa UTF-8.');
  let raw: Record<string, unknown>;
  if (/\.json$/i.test(filename)) {
    try {
      raw = object(JSON.parse(source));
    } catch {
      throw Error('JSON không hợp lệ: cần một đối tượng chứa title, description và items.');
    }
    keys(raw, ['title', 'description', 'items']);
  } else if (/\.csv$/i.test(filename)) {
    const [labels, ...rows] = csvRows(source, csvSeparator(source));
    const header = labels?.map((label) => columnAliases.get(normalizeLabel(label)));
    if (!header || !header.includes('kind'))
      throw Error('CSV cần dòng tên cột theo mẫu, gồm cột Loại nội dung.');
    if (new Set(header).size !== header.length || header.some((name) => !name))
      throw Error('Tên cột CSV không đúng mẫu hoặc bị trùng.');
    raw = { items: [] };
    for (const [index, row] of rows.entries()) {
      if (row.length !== header.length)
        throw Error(`Dòng dữ liệu ${index + 1}: số cột không đúng mẫu.`);
      const value = Object.fromEntries(header.map((name, i) => [name!, row[i]]));
      for (const name of ['title', 'description']) {
        if (!value[name]?.trim()) continue;
        if (raw[name] !== undefined && raw[name] !== value[name])
          throw Error(
            `CSV chỉ chứa một bài học; ${CSV_FIELD_GUIDE.find((field) => field.key === name)!.label} phải thống nhất giữa các dòng.`,
          );
        raw[name] = value[name];
      }
      const ref: Record<string, unknown> = {};
      if (value.example) ref.example = value.example;
      if (value.mediaType)
        ref.type = mediaAliases.get(normalizeLabel(value.mediaType)) || value.mediaType;
      if (value.mediaUrl) ref.url = value.mediaUrl;
      (raw.items as unknown[]).push({
        kind: kindAliases.get(normalizeLabel(value.kind)) || value.kind,
        simplified: value.simplified,
        pinyin: value.pinyin,
        meaning: value.meaning,
        ...(Object.keys(ref).length ? { reference: ref } : {}),
      });
    }
  } else throw Error('Chỉ hỗ trợ file .json hoặc .csv theo mẫu.');
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 100)
    throw Error('File cần từ 1 đến 100 mục nội dung.');
  return {
    ...(raw.title !== undefined ? { title: text(raw.title, 'tiêu đề', true)! } : {}),
    ...(raw.description !== undefined
      ? { description: text(raw.description, 'giải thích bài học', false, IMPORT_MAX_BYTES) }
      : {}),
    items: raw.items.map(item),
  };
}

export function applyLessonImport(
  current: LessonDocument,
  incoming: ImportedLesson,
  mode: 'append' | 'replace',
): LessonDocument {
  const items = mode === 'append' ? [...current.items, ...incoming.items] : incoming.items;
  if (items.length > 100)
    throw Error('Bài học sau khi nhập vượt quá 100 mục. Hãy chia thành nhiều bài.');
  return {
    ...current,
    lesson:
      mode === 'append'
        ? current.lesson
        : {
            ...current.lesson,
            ...(incoming.title !== undefined ? { title: incoming.title } : {}),
            ...(incoming.description !== undefined ? { description: incoming.description } : {}),
          },
    items,
  };
}

export function exportLessonJson(document: LessonDocument): string {
  const source = JSON.stringify(
    {
      title: document.lesson.title,
      description: document.lesson.description,
      items: document.items.map(
        ({ kind, simplified, traditional, pinyin, meaning, hskLevel, reference }) => ({
          kind,
          simplified,
          traditional,
          pinyin,
          meaning,
          hskLevel,
          reference,
        }),
      ),
    },
    null,
    2,
  );
  // A downloadable import file must be restorable by the same importer.
  parseLessonFile('bai-hoc.json', source);
  return source;
}
