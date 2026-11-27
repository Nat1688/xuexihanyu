import { ApiError, request } from '../api/client';
import { getPublicConfig } from '../config/public-config';

export interface DictionarySense {
  publicId: string;
  vietnamese: string | null;
  english: string | null;
}
export interface DictionaryEntry {
  publicId: string;
  chinese: string;
  pinyin: string;
  type: string;
  revision: number;
  verification?: string;
  publication?: string;
  senses: DictionarySense[];
  senseCount?: number;
  nextSenseCursor?: string | null;
  categories?: { publicId: string; label: string }[];
  sources?: { label: string; url: string }[];
}
export interface DictionaryCategory {
  publicId: string;
  parentId: string | null;
  label: string;
  chineseLabel: string | null;
  count: number;
  sentences: number;
  unclassified: number;
}
export interface DictionaryPage {
  items: DictionaryEntry[];
  total: number;
  nextCursor: string | null;
  catalogRevision: string;
}
export interface PublicationPreview {
  category: { publicId: string; label: string; active: boolean; revision: number };
  fingerprint: string;
  total: number;
  published: number;
  unverified: number;
  sharedEntries: number;
  maxGroupSize: number;
  sources: {
    publicId: string;
    label: string;
    url: string;
    rights: string;
    evidence: string | null;
    revision: number;
  }[];
  blockers: string[];
}
export function categoryPath(
  category: DictionaryCategory,
  categories: DictionaryCategory[],
): string {
  const labels = [category.label],
    seen = new Set([category.publicId]);
  let parent = category.parentId;
  while (parent && labels.length < 8) {
    const item = categories.find((c) => c.publicId === parent);
    if (!item || seen.has(item.publicId)) break;
    seen.add(item.publicId);
    labels.unshift(item.label);
    parent = item.parentId;
  }
  return labels.join(' / ');
}
export const typeLabels: Record<string, string> = {
  WORD: 'Từ vựng',
  TERM: 'Thuật ngữ',
  PHRASE: 'Cụm từ',
  SENTENCE: 'Mẫu câu',
  UNCLASSIFIED: 'Chưa phân loại',
};
export const publicationLabels: Record<string, string> = {
  PUBLISHED: 'Đã xuất bản',
  INTERNAL: 'Nội bộ',
  DRAFT: 'Bản nháp',
  ARCHIVED: 'Đã lưu trữ',
};
export const dictionaryClient = {
  publicationPreview: (id: string) =>
    request<PublicationPreview>(
      'GET',
      `/dictionary/admin/categories/${encodeURIComponent(id)}/publication-preview`,
    ),
  publication: (
    id: string,
    body: {
      fingerprint: string;
      action: 'PUBLISH' | 'UNPUBLISH';
      confirmed: true;
      contentReviewed: boolean;
      reviewReference: string;
    },
  ) =>
    request<{ total: number; changed: number }>(
      'POST',
      `/dictionary/admin/categories/${encodeURIComponent(id)}/publication`,
      body,
    ),
  sourceRights: (
    id: string,
    body: {
      expectedRevision: number;
      rights: 'CONFIRMED' | 'UNKNOWN' | 'DENIED';
      evidence: string;
      confirmed: true;
    },
  ) => request('POST', `/dictionary/admin/sources/${encodeURIComponent(id)}/rights`, body),
  batch: (id: string, after?: number) =>
    request<Record<string, unknown>>(
      'GET',
      `/dictionary/admin/imports/${encodeURIComponent(id)}${after ? '?afterOrdinal=' + after : ''}`,
    ),
  categories: (internal: boolean) =>
    request<DictionaryCategory[]>('GET', `/dictionary/${internal ? 'admin/' : ''}categories`),
  search: (query: URLSearchParams, internal: boolean) =>
    request<DictionaryPage>('GET', `/dictionary/${internal ? 'admin/' : ''}entries?${query}`),
  detail: (id: string, internal: boolean, senseAfter?: string) =>
    request<DictionaryEntry>(
      'GET',
      `/dictionary/${internal ? 'admin/' : ''}entries/${encodeURIComponent(id)}${senseAfter ? '?senseAfter=' + encodeURIComponent(senseAfter) : ''}`,
    ),
  report: (entry: DictionaryEntry, comment: string) =>
    request('POST', `/dictionary/entries/${entry.publicId}/reports`, {
      revision: entry.revision,
      comment,
    }),
  async import(file: File, dryRun: boolean): Promise<Record<string, unknown>> {
    const format = file.name.split('.').pop()?.toLowerCase();
    if (!['html', 'json', 'csv'].includes(format || '') || file.size > 16 * 1024 * 1024)
      throw new Error('Chọn tệp HTML, JSON hoặc CSV không quá 16 MB.');
    const csrfCookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('clp_csrf='));
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Dictionary-Format': format!,
      'X-Dictionary-Filename': encodeURIComponent(file.name),
      'X-Dictionary-Confirm': 'IMPORT_INTERNAL_UNVERIFIED',
    };
    if (csrfCookie)
      headers['X-CSRF-Token'] = decodeURIComponent(csrfCookie.slice('clp_csrf='.length));
    const response = await fetch(
      `${getPublicConfig().apiBaseUrl}/dictionary/admin/imports${dryRun ? '/dry-run' : ''}`,
      { method: 'POST', body: file, credentials: 'include', cache: 'no-store', headers },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      throw new ApiError(
        response.status,
        body?.error?.code || 'IMPORT_FAILED',
        'Không thể nhập dữ liệu. Vui lòng kiểm tra tệp và thử lại.',
      );
    }
    return response.json() as Promise<Record<string, unknown>>;
  },
};
export function dictionaryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'DICTIONARY_PUBLICATION_BLOCKED')
      return 'Nhóm chưa đủ điều kiện xuất bản. Hãy xem trước lại và kiểm tra quyền nguồn, nội dung và chuyên ngành.';
    if (error.code === 'DICTIONARY_GROUP_TOO_LARGE')
      return 'Nhóm vượt 25.000 mục từ. Hãy chọn nhóm chuyên ngành nhỏ hơn.';
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.';
    if (error.status === 409) return 'Dữ liệu đã thay đổi. Vui lòng tải lại danh sách.';
    if (error.status === 404) return 'Mục từ không còn khả dụng hoặc bạn chưa có quyền xem.';
    if (error.status === 413) return 'Tệp vượt giới hạn 16 MB.';
  }
  return 'Không thể tải dữ liệu từ điển. Vui lòng kiểm tra kết nối và thử lại.';
}
