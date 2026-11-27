import { WorkspaceBrand } from '../WorkspaceBrand';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { displayNumber } from '../ui-vi';
import {
  dictionaryClient,
  categoryPath,
  type DictionaryCategory,
  type DictionaryEntry,
  type DictionaryPage,
  dictionaryError,
  typeLabels,
  publicationLabels,
} from './client';
import './dictionary.css';
import { PublicationPanel } from './PublicationPanel';

export type DictionaryMode = 'reference' | 'specialties' | 'admin';
const reportLabels: Record<string, string> = {
  inputRows: 'Dòng đầu vào',
  validRows: 'Dòng hợp lệ',
  rejectedRows: 'Dòng cần kiểm tra',
  exactDuplicates: 'Trùng hoàn toàn',
  canonicalDuplicates: 'Trùng sau làm sạch',
  candidateSenses: 'Nghĩa phân biệt',
  candidateHeadwords: 'Mục từ phân biệt',
  missingEnglish: 'Thiếu nghĩa tiếng Anh',
  normalizedRows: 'Dòng đã làm sạch',
  sourceCategories: 'Nhóm nguồn',
  matchedHeadwords: 'Mục từ đã có',
  matchedSenses: 'Nghĩa đã có',
  insertedHeadwords: 'Mục từ mới',
  insertedSenses: 'Nghĩa mới',
  sourceAssociations: 'Liên kết nguồn trong danh mục',
  retainedSourceAssociations: 'Liên kết nguồn giữ trong hồ sơ nhập',
  reviewRequiredRows: 'Dòng chờ rà soát mục từ đã hiệu đính',
  declaredOriginalRows: 'Số gốc khai báo trong tệp (chưa xác minh)',
  dictionaryWrites: 'Thao tác ghi dữ liệu từ điển',
};

export function Dictionary({
  mode,
  onClose,
  onExpired,
}: {
  mode: DictionaryMode;
  onClose: () => void;
  onExpired: () => void;
}) {
  const internal = mode === 'admin';
  const [q, setQ] = useState(''),
    [term, setTerm] = useState(''),
    [category, setCategory] = useState(''),
    [type, setType] = useState(''),
    [sort, setSort] = useState('relevance');
  const [categories, setCategories] = useState<DictionaryCategory[]>([]),
    [page, setPage] = useState<DictionaryPage | null>(null);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [detail, setDetail] = useState<DictionaryEntry | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [importReport, setImportReport] = useState<Record<string, unknown> | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null),
    returnFocus = useRef<HTMLElement | null>(null),
    detailRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) expired.current();
    else setError(dictionaryError(e));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(q.trim());
      setCursors([undefined]);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    let active = true;
    dictionaryClient
      .categories(internal)
      .then((v) => {
        if (active) setCategories(v);
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [internal, refresh, fail]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ q: term, sort, limit: '20' });
    if (category) query.set('categoryId', category);
    if (type) query.set('type', type);
    const cursor = cursors.at(-1);
    if (cursor) query.set('cursor', cursor);
    dictionaryClient
      .search(query, internal)
      .then((v) => {
        if (active) setPage(v);
      })
      .catch((e) => {
        if (active) {
          setPage(null);
          fail(e);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [term, sort, category, type, cursors, internal, refresh, fail]);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  async function open(entry: DictionaryEntry) {
    const version = ++detailRequest.current;
    returnFocus.current = document.activeElement as HTMLElement;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await dictionaryClient.detail(entry.publicId, internal);
      if (mounted.current && version === detailRequest.current) {
        setDetail(data);
        setComment('');
      }
    } catch (e) {
      if (mounted.current && version === detailRequest.current) fail(e);
    } finally {
      if (mounted.current && version === detailRequest.current) setBusy(false);
    }
  }
  function closeDetail() {
    setDetail(null);
    setNotice('');
    requestAnimationFrame(() => returnFocus.current?.focus());
  }
  async function copy(entry: DictionaryEntry) {
    try {
      await navigator.clipboard.writeText(
        [
          entry.chinese,
          entry.pinyin,
          ...entry.senses.map((s) => [s.vietnamese, s.english].filter(Boolean).join(' · ')),
        ].join('\n'),
      );
      setNotice('Đã sao chép mục từ.');
    } catch {
      setNotice('Không thể sao chép tự động. Bạn có thể chọn và sao chép nội dung trực tiếp.');
    }
  }
  async function runImport(dryRun: boolean) {
    if (!file || busy || (!dryRun && !confirmed)) return;
    setBusy(true);
    setError('');
    try {
      setImportReport(await dictionaryClient.import(file, dryRun));
      if (!dryRun) {
        setCursors([undefined]);
        setRefresh((n) => n + 1);
      }
    } catch (e) {
      fail(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function senses(entry: DictionaryEntry) {
    return (
      <div className="dict-senses">
        {entry.senses.map((s) => (
          <div key={s.publicId}>
            {s.vietnamese && <p>{s.vietnamese}</p>}
            {s.english && (
              <p className="clp-muted" lang="en">
                {s.english}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className="clp-card dict-page" aria-labelledby="dictionary-title">
      <WorkspaceBrand />
      <button className="clp-button clp-button--secondary" disabled={busy} onClick={onClose}>
        ← Về không gian học tập
      </button>
      <header className="dict-heading">
        <p className="ink-eyebrow" lang="zh">
          {mode === 'specialties' ? '专业汉语' : '词典'}
        </p>
        <h1 id="dictionary-title">
          {internal
            ? 'Quản lý từ điển'
            : mode === 'specialties'
              ? 'Tiếng Trung chuyên ngành'
              : 'Từ điển tiếng Trung'}
        </h1>
        <p className="clp-muted">Tra cứu từ vựng, thuật ngữ và mẫu câu chuyên ngành.</p>
      </header>
      {internal && (
        <p className="tw-notice">
          Chế độ nội bộ dành cho quản trị viên. Dữ liệu mới nhập chưa xuất bản. Chỉ nội dung đã rà
          soát, có quyền sử dụng nguồn và đã xuất bản mới hiển thị trong tra cứu chung.
        </p>
      )}
      {internal && (
        <PublicationPanel
          categories={categories}
          busy={busy}
          setBusy={setBusy}
          onError={fail}
          onChanged={() => {
            setCursors([undefined]);
            setDetail(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {internal && (
        <details className="dict-import">
          <summary>Nhập dữ liệu từ điển</summary>
          <fieldset disabled={busy}>
            <label>
              Tệp dữ liệu (HTML, JSON hoặc CSV; tối đa 16 MB)
              <input
                type="file"
                accept=".html,.json,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setImportReport(null);
                  setConfirmed(false);
                }}
              />
            </label>
            <label className="dict-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              Tôi xác nhận chỉ nhập nội bộ, chưa hiệu đính và chưa xuất bản.
            </label>
            <div className="clp-actions">
              <button
                className="clp-button clp-button--secondary"
                disabled={!file}
                onClick={() => void runImport(true)}
              >
                Kiểm tra tệp, không ghi dữ liệu
              </button>
              <button
                className="clp-button"
                disabled={!file || !confirmed}
                onClick={() => void runImport(false)}
              >
                Nhập dữ liệu nội bộ
              </button>
            </div>
          </fieldset>
          {importReport && (
            <div role="status">
              <h2>
                {importReport.dryRun
                  ? 'Kết quả kiểm tra tệp'
                  : importReport.replay
                    ? 'Tệp đã được nhập trước đó'
                    : 'Kết quả nhập dữ liệu'}
              </h2>
              {typeof importReport.batchId === 'string' && (
                <button
                  className="clp-button clp-button--secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const data = await dictionaryClient.batch(String(importReport.batchId));
                      setImportReport({ ...importReport, ...data });
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Xem các dòng cần kiểm tra
                </button>
              )}
              {Array.isArray(importReport.issues) && (
                <ul>
                  {(importReport.issues as Array<{ ordinal: number; outcome: string }>).map(
                    (issue) => (
                      <li key={issue.ordinal}>
                        Dòng {displayNumber(issue.ordinal)}:{' '}
                        {issue.outcome === 'REVIEW_REQUIRED'
                          ? 'Đề xuất mới cho mục từ đã hiệu đính; chưa áp dụng.'
                          : issue.outcome === 'REJECTED'
                            ? 'Cấu trúc chưa hợp lệ; chưa đưa vào danh mục.'
                            : 'Cần kiểm tra nội dung hoặc trường còn thiếu.'}
                      </li>
                    ),
                  )}
                </ul>
              )}
              {typeof importReport.nextIssueOrdinal === 'number' && (
                <button
                  className="clp-button clp-button--secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const more = await dictionaryClient.batch(
                        String(importReport.batchId),
                        Number(importReport.nextIssueOrdinal),
                      );
                      setImportReport({
                        ...importReport,
                        ...more,
                        issues: [
                          ...(importReport.issues as unknown[]),
                          ...(more.issues as unknown[]),
                        ],
                      });
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Xem thêm dòng cần kiểm tra
                </button>
              )}
              <dl className="dict-report">
                {Object.entries(reportLabels)
                  .filter(([key]) => typeof importReport[key] === 'number')
                  .map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{displayNumber(Number(importReport[key]))}</dd>
                    </div>
                  ))}
              </dl>
              {Array.isArray(importReport.sourceCategoryCounts) && (
                <>
                  <h3>Đối soát theo nhóm nguồn</h3>
                  <ul>
                    {(
                      importReport.sourceCategoryCounts as Array<{ label: string; count: number }>
                    ).map((c, i) => (
                      <li key={i}>
                        {c.label}: {displayNumber(c.count)} dòng
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </details>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div role="alert" className="clp-error">
          <p>{error}</p>
          <button
            className="clp-button clp-button--secondary"
            onClick={() => {
              setCursors([undefined]);
              setRefresh((n) => n + 1);
            }}
          >
            Tải lại danh sách
          </button>
        </div>
      )}
      {detail ? (
        <article className="dict-detail">
          <button className="clp-button clp-button--secondary" onClick={closeDetail}>
            ← Về kết quả tra cứu
          </button>
          <h2 ref={detailHeading} tabIndex={-1} lang="zh">
            {detail.chinese}
          </h2>
          <p className="dict-pinyin">{detail.pinyin || 'Chưa có Pinyin'}</p>
          <span className="clp-badge">{typeLabels[detail.type]}</span>
          {internal && (
            <span className="clp-badge">
              {publicationLabels[detail.publication || 'INTERNAL']} ·{' '}
              {detail.verification === 'VERIFIED' ? 'Đã hiệu đính' : 'Chưa hiệu đính'}
            </span>
          )}
          {senses(detail)}
          {detail.nextSenseCursor && (
            <button
              className="clp-button clp-button--secondary"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const more = await dictionaryClient.detail(
                    detail.publicId,
                    internal,
                    detail.nextSenseCursor!,
                  );
                  if (more.revision !== detail.revision)
                    throw new ApiError(409, 'REVISION_CHANGED', '');
                  setDetail({ ...more, senses: [...detail.senses, ...more.senses] });
                } catch (e) {
                  fail(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Xem thêm nghĩa
            </button>
          )}
          <button className="clp-button clp-button--secondary" onClick={() => void copy(detail)}>
            Sao chép
          </button>
          <h3>Chuyên ngành</h3>
          <p>
            {detail.categories?.map((c) => c.label).join(' · ') || 'Chưa phân loại chuyên ngành'}
          </p>
          <h3>Nguồn dữ liệu</h3>
          <ul>
            {detail.sources?.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          {!internal && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || !comment.trim()) return;
                setBusy(true);
                try {
                  await dictionaryClient.report(detail, comment.trim());
                  setComment('');
                  setNotice('Đã gửi báo cáo sai sót.');
                } catch (e) {
                  fail(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Báo cáo sai sót
                <textarea
                  maxLength={2000}
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={busy}
                />
              </label>
              <button className="clp-button" disabled={busy}>
                Gửi báo cáo
              </button>
            </form>
          )}
        </article>
      ) : (
        <>
          <form className="dict-filters" onSubmit={(e) => e.preventDefault()}>
            <label className="dict-query">
              Tìm kiếm
              <input
                type="search"
                maxLength={120}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nhập chữ Hán, Pinyin, tiếng Việt hoặc tiếng Anh..."
              />
            </label>
            <label>
              Chuyên ngành
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCursors([undefined]);
                }}
              >
                <option value="">Tất cả chuyên ngành</option>
                {categories.map((c) => (
                  <option key={c.publicId} value={c.publicId}>
                    {categoryPath(c, categories)} ({displayNumber(c.count)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Loại nội dung
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setCursors([undefined]);
                }}
              >
                <option value="">Tất cả loại nội dung</option>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sắp xếp theo
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setCursors([undefined]);
                }}
              >
                <option value="relevance">Mức độ liên quan</option>
                <option value="pinyin">Theo Pinyin</option>
                <option value="chinese">Theo chữ Hán</option>
              </select>
            </label>
            <button
              type="button"
              className="clp-button clp-button--secondary"
              onClick={() => {
                setQ('');
                setTerm('');
                setCategory('');
                setType('');
                setSort('relevance');
                setCursors([undefined]);
              }}
            >
              Xóa bộ lọc
            </button>
          </form>
          {mode === 'specialties' && !category && (
            <div className="dict-category-grid">
              {categories
                .filter((c) => !c.parentId)
                .map((c) => (
                  <button
                    className="dict-category"
                    key={c.publicId}
                    onClick={() => {
                      setCategory(c.publicId);
                      setCursors([undefined]);
                    }}
                  >
                    <strong>{c.label}</strong>
                    {c.chineseLabel && <span lang="zh">{c.chineseLabel}</span>}
                    <span>
                      {displayNumber(c.count)} mục từ · {displayNumber(c.sentences)} mẫu câu
                    </span>
                    <small>{displayNumber(c.unclassified)} mục chưa phân loại nội dung</small>
                  </button>
                ))}
            </div>
          )}
          {loading || busy ? (
            <p role="status">{busy ? 'Đang xử lý, vui lòng chờ…' : 'Đang tra cứu từ điển…'}</p>
          ) : null}
          {!loading && page && (
            <>
              <p role="status">{displayNumber(page.total)} kết quả tìm kiếm</p>
              {!page.items.length && (
                <p className="tw-empty">
                  {term || category || type
                    ? 'Không tìm thấy kết quả. Hãy thử từ khóa ngắn hơn hoặc xóa bộ lọc.'
                    : 'Chưa có mục từ đã được duyệt để hiển thị.'}
                </p>
              )}
              <div className="dict-results" aria-busy={loading}>
                {page.items.map((entry) => (
                  <article className="dict-entry" key={entry.publicId}>
                    <h2 lang="zh">{entry.chinese}</h2>
                    <p className="dict-pinyin">{entry.pinyin || 'Chưa có Pinyin'}</p>
                    <span className="clp-badge">{typeLabels[entry.type]}</span>
                    {internal && (
                      <span className="clp-badge">
                        {publicationLabels[entry.publication || 'INTERNAL']}
                      </span>
                    )}
                    {senses(entry)}
                    {(entry.senseCount || 0) > entry.senses.length && (
                      <p className="clp-muted">Còn nghĩa khác — mở chi tiết để xem đầy đủ.</p>
                    )}
                    <div className="clp-actions">
                      <button
                        className="clp-button"
                        disabled={busy}
                        onClick={() => void open(entry)}
                      >
                        Xem chi tiết<span className="tw-sr-only">: {entry.chinese}</span>
                      </button>
                      <button
                        className="clp-button clp-button--secondary"
                        onClick={() => void copy(entry)}
                      >
                        Sao chép<span className="tw-sr-only">: {entry.chinese}</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <nav className="clp-actions dict-pagination" aria-label="Phân trang từ điển">
                <button
                  className="clp-button clp-button--secondary"
                  disabled={loading || cursors.length === 1}
                  onClick={() => setCursors((v) => v.slice(0, -1))}
                >
                  Trang trước
                </button>
                <span>Trang {displayNumber(cursors.length)}</span>
                <button
                  className="clp-button clp-button--secondary"
                  disabled={loading || !page.nextCursor}
                  onClick={() => setCursors((v) => [...v, page.nextCursor!])}
                >
                  Trang sau
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}
