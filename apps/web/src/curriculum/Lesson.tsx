import { ApiError } from '../api/client';
import { useCallback, useEffect, useState } from 'react';
import { curriculumApi, type LessonDocument, type LessonItem } from './api';
import { useResource } from '../teacher/useResource';
import { ResourceView } from '../teacher/TeacherViews';
import { studentError } from '../ui-vi';
import './curriculum.css';
const kinds: Record<string, string> = {
  VOCABULARY: 'Từ vựng',
  CHARACTER: 'Chữ Hán',
  GRAMMAR: 'Ngữ pháp',
  EXAMPLE: 'Ví dụ / hội thoại',
  MEDIA_REFERENCE: 'Hình ảnh / âm thanh',
};
function safeMedia(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function LessonContent({ document }: { document: LessonDocument }) {
  return (
    <article className="lesson-reading">
      <p className="tw-eyebrow">Học tiếng Trung · 学习汉语</p>
      <h1>{document.lesson.title}</h1>
      {document.lesson.description ? (
        <p className="lesson-intro">{document.lesson.description}</p>
      ) : null}
      <nav className="clp-actions" aria-label="Các phần bài học">
        {document.items.map((item, index) => (
          <a key={index} href={`#lesson-block-${index}`}>
            {index + 1}. {item.simplified || kinds[item.kind]}
          </a>
        ))}
      </nav>
      {document.items.map((item, index) => (
        <section id={`lesson-block-${index}`} className="lesson-block" key={item.publicId || index}>
          <p className="tw-eyebrow">
            {index + 1} · {kinds[item.kind] || 'Nội dung'}
          </p>
          {item.simplified ? <h2 lang="zh-Hans">{item.simplified}</h2> : null}
          {item.pinyin ? (
            <p className="lesson-pinyin" lang="zh-Latn">
              {item.pinyin}
            </p>
          ) : null}
          {item.meaning ? <p className="lesson-meaning">{item.meaning}</p> : null}
          {typeof item.reference?.example === 'string' ? (
            <p className="lesson-example">{item.reference.example}</p>
          ) : null}
          {item.kind === 'MEDIA_REFERENCE' && safeMedia(item.reference?.url) ? (
            item.reference?.type === 'audio' ? (
              <audio
                controls
                preload="none"
                src={safeMedia(item.reference?.url)}
                aria-label="Âm thanh bài học"
              />
            ) : (
              <img
                loading="lazy"
                src={safeMedia(item.reference?.url)}
                alt={item.meaning || 'Hình minh họa bài học'}
              />
            )
          ) : null}
        </section>
      ))}
      {!document.items.length ? <p>Bài học chưa có nội dung.</p> : null}
    </article>
  );
}
export function PublishedLesson({
  id,
  onBack,
  onExpired,
  onPractice,
  resumeKey,
}: {
  id: string;
  onBack: () => void;
  onExpired: () => void;
  onPractice: () => void;
  resumeKey?: string;
}) {
  const load = useCallback(() => curriculumApi.read(id), [id]);
  const resource = useResource(load, onExpired);
  return (
    <>
      <div className="clp-actions">
        <button className="clp-button clp-button--secondary" onClick={onBack}>
          ← Bài được giao
        </button>
        <button className="clp-button" onClick={onPractice}>
          Luyện tập bài này →
        </button>
      </div>
      <ResourceView state={resource.state} retry={resource.refresh}>
        {(document) => <ResumableContent document={document} resumeKey={resumeKey} />}
      </ResourceView>
    </>
  );
}
function ResumableContent({
  document,
  resumeKey,
}: {
  document: LessonDocument;
  resumeKey?: string;
}) {
  useEffect(() => {
    if (!resumeKey) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const position = Number(window.localStorage.getItem(resumeKey));
      if (Number.isFinite(position) && position > 0)
        window.requestAnimationFrame(() => window.scrollTo(0, position));
    } catch {
      /* Optional local resume only. */
    }
    const save = () => {
      try {
        window.localStorage.setItem(resumeKey, String(window.scrollY));
      } catch {
        /* Optional local resume only. */
      }
    };
    const scroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 150);
    };
    window.addEventListener('scroll', scroll);
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(timer);
      save();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('pagehide', save);
    };
  }, [resumeKey]);
  return <LessonContent document={document} />;
}
export function LessonEditor({
  id,
  onExpired,
  onBack,
  onDirtyChange,
  onBusyChange,
  onAssign,
}: {
  onAssign: () => void;
  id: string;
  onExpired: () => void;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [document, setDocument] = useState<LessonDocument | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    let active = true;
    void curriculumApi
      .read(id)
      .then((value) => {
        if (active) setDocument(value);
      })
      .catch((err) => {
        if (active) {
          if (err instanceof ApiError && err.status === 401) onExpired();
          else setError(studentError(err, 'Không tải được bài học.'));
        }
      });
    return () => {
      active = false;
    };
  }, [id, onExpired]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(next: LessonDocument) {
    setDocument(next);
    setDirty(true);
    setNotice('');
  }
  async function save(visibility: string) {
    if (!document || busy) return;
    setBusy(true);
    setError('');
    try {
      setDocument(await curriculumApi.save(id, document, visibility));
      setDirty(false);
      setNotice(
        visibility === 'PUBLISHED'
          ? 'Đã xuất bản. Bạn có thể giao bài học trong lớp.'
          : 'Đã lưu bản nháp trên hệ thống.',
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(studentError(err, 'Không lưu được bài học. Vui lòng kiểm tra kết nối.'));
    } finally {
      setBusy(false);
    }
  }
  if (!document)
    return (
      <div>
        <p role={error ? 'alert' : 'status'}>{error || 'Đang tải bài học…'}</p>
        <button onClick={onBack}>Về khóa học</button>
      </div>
    );
  const update = (index: number, patch: Partial<LessonItem>) =>
    change({
      ...document,
      items: document.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <section>
      <div className="tw-section-heading">
        <div>
          <p className="tw-eyebrow">Trình soạn bài học</p>
          <h1>{document.lesson.title}</h1>
          <p>
            {dirty
              ? 'Có thay đổi chưa lưu'
              : document.lesson.visibility === 'PUBLISHED'
                ? 'Đã xuất bản'
                : 'Bản nháp'}
          </p>
        </div>
        <button
          className="clp-button clp-button--secondary"
          disabled={busy}
          onClick={() => {
            if (!dirty || window.confirm('Bạn có thay đổi chưa lưu. Rời trình soạn bài?')) onBack();
          }}
        >
          ← Khóa học
        </button>
      </div>
      <fieldset disabled={busy} className="tw-fieldset">
        <div className="clp-actions">
          <button className="clp-button clp-button--secondary" onClick={() => setPreview(!preview)}>
            {preview ? 'Tiếp tục chỉnh sửa' : 'Xem trước như học viên'}
          </button>
          <button className="clp-button clp-button--secondary" onClick={() => void save('DRAFT')}>
            Lưu bản nháp
          </button>
          <button className="clp-button" onClick={() => void save('PUBLISHED')}>
            Xuất bản bài học
          </button>
        </div>
        {error ? (
          <p role="alert" className="clp-error">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="tw-notice">
            {notice}
          </p>
        ) : null}
        {busy ? <p role="status">Đang lưu bài học…</p> : null}
        {document.lesson.visibility === 'PUBLISHED' && !dirty ? (
          <p className="clp-actions">
            <button type="button" className="clp-button" onClick={onAssign}>
              Chọn lớp để giao bài →
            </button>
          </p>
        ) : null}
        {preview ? (
          <LessonContent document={document} />
        ) : (
          <>
            <label className="clp-field">
              Tiêu đề bài học
              <input
                className="clp-input"
                maxLength={200}
                value={document.lesson.title}
                onChange={(e) =>
                  change({ ...document, lesson: { ...document.lesson, title: e.target.value } })
                }
              />
            </label>
            <label className="clp-field">
              Nội dung / giải thích bài học
              <textarea
                className="clp-input"
                rows={5}
                value={document.lesson.description || ''}
                onChange={(e) =>
                  change({
                    ...document,
                    lesson: { ...document.lesson, description: e.target.value },
                  })
                }
              />
            </label>
            <h2>Nội dung bài học</h2>
            <p className="clp-muted">
              Từ vựng có chữ Hán, Pinyin và nghĩa sẽ dùng được trong phần luyện tập chấm tự động
              hiện có.
            </p>
            {document.items.map((item, index) => (
              <section className="tw-panel" key={index}>
                <div className="tw-section-heading">
                  <h3>
                    {index + 1}. {kinds[item.kind]}
                  </h3>
                  <div className="clp-actions">
                    <button
                      type="button"
                      disabled={!index}
                      aria-label={`Chuyển mục ${index + 1} lên`}
                      onClick={() => {
                        const items = [...document.items];
                        [items[index - 1], items[index]] = [items[index], items[index - 1]];
                        change({ ...document, items });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === document.items.length - 1}
                      aria-label={`Chuyển mục ${index + 1} xuống`}
                      onClick={() => {
                        const items = [...document.items];
                        [items[index + 1], items[index]] = [items[index], items[index + 1]];
                        change({ ...document, items });
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        change({ ...document, items: document.items.filter((_, i) => i !== index) })
                      }
                    >
                      Xóa mục
                    </button>
                  </div>
                </div>
                {item.kind !== 'MEDIA_REFERENCE' ? (
                  <>
                    <label className="clp-field">
                      Chữ Hán / cấu trúc / câu ví dụ
                      <input
                        className="clp-input"
                        lang="zh-Hans"
                        maxLength={200}
                        value={item.simplified || ''}
                        onChange={(e) => update(index, { simplified: e.target.value })}
                      />
                    </label>
                    <label className="clp-field">
                      Pinyin
                      <input
                        className="clp-input"
                        maxLength={200}
                        value={item.pinyin || ''}
                        onChange={(e) => update(index, { pinyin: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="clp-field">
                      Loại tài nguyên
                      <select
                        className="clp-input"
                        value={String(item.reference?.type || 'image')}
                        onChange={(e) =>
                          update(index, { reference: { ...item.reference, type: e.target.value } })
                        }
                      >
                        <option value="image">Hình ảnh</option>
                        <option value="audio">Âm thanh</option>
                      </select>
                    </label>
                    <label className="clp-field">
                      Đường dẫn HTTPS có sẵn
                      <input
                        className="clp-input"
                        type="url"
                        value={String(item.reference?.url || '')}
                        onChange={(e) =>
                          update(index, { reference: { ...item.reference, url: e.target.value } })
                        }
                      />
                    </label>
                  </>
                )}
                <label className="clp-field">
                  Nghĩa / giải thích tiếng Việt
                  <input
                    className="clp-input"
                    maxLength={200}
                    value={item.meaning || ''}
                    onChange={(e) => update(index, { meaning: e.target.value })}
                  />
                </label>
                <label className="clp-field">
                  Ví dụ sử dụng
                  <textarea
                    className="clp-input"
                    value={String(item.reference?.example || '')}
                    onChange={(e) =>
                      update(index, { reference: { ...item.reference, example: e.target.value } })
                    }
                  />
                </label>
              </section>
            ))}
            <div className="clp-actions">
              {Object.entries(kinds).map(([kind, label]) => (
                <button
                  className="clp-button clp-button--secondary"
                  key={kind}
                  disabled={document.items.length >= 100}
                  onClick={() =>
                    change({
                      ...document,
                      items: [
                        ...document.items,
                        {
                          kind,
                          simplified: '',
                          pinyin: '',
                          meaning: '',
                          reference: kind === 'MEDIA_REFERENCE' ? { type: 'image', url: '' } : null,
                        },
                      ],
                    })
                  }
                >
                  + {label}
                </button>
              ))}
            </div>
          </>
        )}
      </fieldset>
    </section>
  );
}
