import { useCallback, useEffect, useState } from 'react';
import { teacherApi, type ContentNode } from '../api/teacher';
import { curriculumApi } from './api';
import { LessonEditor } from './Lesson';
import { useResource } from '../teacher/useResource';
import { ResourceView } from '../teacher/TeacherViews';
import { studentError } from '../ui-vi';
export function Curriculum({
  onExpired,
  onDirtyChange,
  onBusyChange,
  onAssign,
}: {
  onAssign: () => void;
  onExpired: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [course, setCourse] = useState<ContentNode | null>(null);
  const [unit, setUnit] = useState<ContentNode | null>(null);
  const [lesson, setLesson] = useState<ContentNode | null>(null);
  const load = useCallback(
    () =>
      unit
        ? teacherApi.lessons(unit.publicId)
        : course
          ? teacherApi.units(course.publicId)
          : teacherApi.courses(),
    [course, unit],
  );
  const resource = useResource(load, onExpired);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (lesson) return;
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, lesson, onBusyChange]);
  if (lesson)
    return (
      <LessonEditor
        key={lesson.publicId}
        id={lesson.publicId}
        onAssign={onAssign}
        onDirtyChange={onDirtyChange}
        onBusyChange={onBusyChange}
        onExpired={onExpired}
        onBack={() => {
          setLesson(null);
          resource.refresh();
        }}
      />
    );
  const label = unit ? 'bài học' : course ? 'chương' : 'khóa học';
  return (
    <section>
      <p className="tw-eyebrow">Thư viện giảng dạy</p>
      <h1>{unit?.title || course?.title || 'Khóa học & bài học'}</h1>
      <p className="clp-muted">
        Tổ chức nội dung theo khóa học → chương → bài học. Soạn nội dung, xem trước và xuất bản
        trước khi giao cho lớp.
      </p>
      <p role="status">
        {unit
          ? 'Bước 3/3: Tạo bài học, thêm nội dung và xuất bản để giao cho lớp.'
          : course
            ? 'Bước 2/3: Chọn hoặc tạo chương. Tiếp theo, bạn sẽ soạn bài học trong chương đó.'
            : 'Bước 1/3: Chọn khóa học đã có bên dưới, hoặc tạo khóa học mới để bắt đầu soạn bài.'}
      </p>
      <nav className="clp-actions" aria-label="Điều hướng nội dung">
        <button
          className="clp-button clp-button--secondary"
          onClick={() => {
            setCourse(null);
            setUnit(null);
            setEdit(false);
          }}
        >
          Tất cả khóa học
        </button>
        {unit ? (
          <button className="clp-button clp-button--secondary" onClick={() => setUnit(null)}>
            ← {course?.title}
          </button>
        ) : null}
        {course && !unit ? (
          <button
            className="clp-button clp-button--secondary"
            onClick={() => {
              setEdit(!edit);
              setTitle(course.title);
              setDescription(course.description || '');
            }}
          >
            Chỉnh sửa khóa học
          </button>
        ) : null}
      </nav>
      <ResourceView state={resource.state} retry={resource.refresh}>
        {(rows) => (
          <>
            <div className="curriculum-grid">
              {rows.map((row) => (
                <article className="tw-panel" key={row.publicId}>
                  <span className="curriculum-tag">
                    {row.visibility === 'PUBLISHED' ? 'Đã xuất bản' : 'Bản nháp'}
                  </span>
                  <h2>{row.title}</h2>
                  <p>{row.description}</p>
                  <button
                    className="clp-button clp-button--secondary"
                    onClick={() => {
                      if (unit) setLesson(row);
                      else if (course) setUnit(row);
                      else setCourse(row);
                      setEdit(false);
                      setTitle('');
                    }}
                  >
                    {unit ? 'Soạn bài học →' : course ? 'Mở chương →' : 'Chọn khóa học →'}
                  </button>
                </article>
              ))}
            </div>
            {!rows.length ? (
              <div className="clp-card">
                <h2>Chưa có {label}</h2>
                <p>Tạo {label} đầu tiên để bắt đầu xây dựng nội dung giảng dạy.</p>
              </div>
            ) : null}
            <form
              className="tw-panel"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || !title.trim()) return;
                setBusy(true);
                setError('');
                const operation =
                  edit && course
                    ? curriculumApi.editCourse(course, title, description)
                    : curriculumApi.create(
                        unit
                          ? `units/${unit.publicId}/lessons`
                          : course
                            ? `courses/${course.publicId}/units`
                            : 'courses',
                        title,
                        rows.reduce((max, row) => Math.max(max, row.position + 1), 0),
                      );
                void operation
                  .then((row) => {
                    if (edit) {
                      setCourse(row);
                      setEdit(false);
                    } else if (unit) setLesson(row);
                    else if (course) setUnit(row);
                    else setCourse(row);
                    setTitle('');
                    resource.refresh();
                  })
                  .catch((err) => setError(studentError(err, 'Không thể lưu nội dung.')))
                  .finally(() => setBusy(false));
              }}
            >
              <h2>{edit ? 'Chỉnh sửa khóa học' : `Tạo ${label}`}</h2>
              <fieldset disabled={busy} className="tw-fieldset">
                <label className="clp-field">
                  Tên {label}
                  <input
                    className="clp-input"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                {edit ? (
                  <label className="clp-field">
                    Mô tả
                    <textarea
                      className="clp-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                ) : null}
                <button className="clp-button">
                  {busy ? 'Đang lưu…' : edit ? 'Lưu khóa học' : `Tạo ${label}`}
                </button>
              </fieldset>
              {error ? <p role="alert">{error}</p> : null}
            </form>
          </>
        )}
      </ResourceView>
    </section>
  );
}
