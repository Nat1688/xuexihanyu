import { Injectable } from '@nestjs/common';
import { CONTENT_TYPES, canonical, DictionaryError, invalid, parseImport, uuid } from './domain';
import { DictionaryRepository, SearchInput } from './repository';

@Injectable()
export class DictionaryService {
  constructor(private readonly repository: DictionaryRepository) {}
  publicationPreview(id: string) {
    return this.repository.publicationPreview(id);
  }
  changePublication(id: string, actorId: string, body: unknown) {
    return this.repository.changePublication(id, actorId, body);
  }
  changeSourceRights(id: string, actorId: string, body: unknown) {
    return this.repository.changeSourceRights(id, actorId, body);
  }
  search(query: Record<string, unknown>, internal: boolean) {
    const allowed = ['q', 'categoryId', 'type', 'sort', 'limit', 'cursor', 'includeDescendants'];
    if (Object.keys(query).some((k) => !allowed.includes(k))) invalid();
    for (const value of Object.values(query)) if (typeof value !== 'string') invalid();
    const q = canonical(String(query.q || ''));
    if ([...q].length > 120 || /[\u0000-\u001f\u007f]/u.test(q))
      invalid('Từ khóa không được dài quá 120 ký tự.');
    const sort = String(query.sort || 'relevance');
    if (!['relevance', 'pinyin', 'chinese'].includes(sort)) invalid();
    const limit = Number(query.limit || 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid();
    const type = query.type ? String(query.type) : undefined;
    if (type && !CONTENT_TYPES.includes(type as (typeof CONTENT_TYPES)[number])) invalid();
    const cursor = query.cursor ? String(query.cursor) : undefined;
    if (cursor && (cursor.length > 2000 || !/^[\w-]+$/u.test(cursor))) invalid();
    if (
      query.includeDescendants !== undefined &&
      !['true', 'false'].includes(String(query.includeDescendants))
    )
      invalid();
    const input: SearchInput = {
      q,
      sort,
      limit,
      type,
      cursor,
      includeDescendants: query.includeDescendants !== 'false',
      categoryId: query.categoryId ? uuid(query.categoryId) : undefined,
    };
    return this.repository.search(input, internal);
  }
  detail(id: string, internal: boolean, senseAfter?: unknown) {
    return this.repository.detail(
      uuid(id),
      internal,
      senseAfter === undefined ? null : uuid(senseAfter),
    );
  }
  categories(internal: boolean) {
    return this.repository.categories(internal);
  }
  overview() {
    return this.repository.overview();
  }
  batch(id: string, afterOrdinal?: unknown) {
    const after = afterOrdinal === undefined ? 0 : Number(afterOrdinal);
    if (
      (afterOrdinal !== undefined && typeof afterOrdinal !== 'string') ||
      !Number.isInteger(after) ||
      after < 0 ||
      after > 100000
    )
      invalid();
    return this.repository.batch(uuid(id), after);
  }
  report(id: string, actorId: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
    const values = body as Record<string, unknown>;
    if (
      Object.keys(values).some((k) => !['revision', 'comment'].includes(k)) ||
      !Number.isInteger(values.revision) ||
      Number(values.revision) < 1 ||
      typeof values.comment !== 'string' ||
      !values.comment.trim() ||
      values.comment.length > 2000
    )
      invalid();
    return this.repository.report(
      uuid(id),
      actorId,
      Number(values.revision),
      values.comment.trim(),
    );
  }
  async import(bytes: Buffer, format: string, filename: string, actorId: string, dryRun: boolean) {
    if (!filename || filename.length > 200 || /[\x00-\x1f\\/]/u.test(filename))
      invalid('Tên tệp chưa hợp lệ.');
    const document = parseImport(bytes, format);
    if (dryRun)
      return {
        dryRun: true,
        checksum: document.checksum,
        ...document.summary,
        dictionaryWrites: 0,
        sessionActivityMayRefresh: true,
        declaredOriginalRows: document.declaredCounts?.reduce((a, b) => a + b, 0) ?? null,
        sourceCategoryCounts: document.categories.map((c, i) => ({
          label: c.label,
          count: document.rows.filter((r) => r.categories.includes(i)).length,
          declaredCount: document.declaredCounts?.[i] ?? null,
        })),
        note: 'Kiểm tra tệp; số đã có trong cơ sở dữ liệu được đối soát khi nhập.',
      };
    return this.repository.import(document, filename, actorId);
  }
}

/** Bounded per-account budget; no token, password or query text retained. */
@Injectable()
export class DictionaryRateLimiter {
  private readonly counters = new Map<string, { count: number; expires: number }>();
  check(actor: string, operation: 'read' | 'import' | 'report'): void {
    const now = Date.now(),
      key = `${actor}:${operation}`;
    for (const [id, item] of this.counters) if (item.expires <= now) this.counters.delete(id);
    if (!this.counters.has(key) && this.counters.size >= 5000)
      throw new DictionaryError(
        429,
        'DICTIONARY_RATE_LIMIT',
        'Hệ thống đang bận. Vui lòng thử lại sau.',
      );
    const counter = this.counters.get(key) || { count: 0, expires: now + 60000 };
    if (++counter.count > (operation === 'read' ? 120 : operation === 'report' ? 5 : 2))
      throw new DictionaryError(
        429,
        'DICTIONARY_RATE_LIMIT',
        'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
      );
    this.counters.set(key, counter);
  }
}
