import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { teacherApi } from '../api/teacher';
import { teacherError } from './model';
import { ResourceView } from './TeacherViews';
import { useResource } from './useResource';

/** No automatic mutation retries: a network failure may happen after commit. */
function useMutation(onExpired: () => void, onBusyChange?: (busy: boolean) => void) {
  const active = useRef(true);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(operation: () => Promise<unknown>, done: () => void) {
    if (lock.current) return;
    lock.current = true;
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (active.current) done();
    } catch (failure) {
      if (!active.current) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setError(teacherError(failure));
    } finally {
      lock.current = false;
      onBusyChange?.(false);
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, run };
}

export function CreateClassForm({
  onExpired,
  onSaved,
  onCancel,
  onBusyChange,
}: {
  onExpired: () => void;
  onSaved: () => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('');
  const mutation = useMutation(onExpired, onBusyChange);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    void mutation.run(() => teacherApi.createClass(title.trim(), term.trim() || null), onSaved);
  }
  return (
    <form onSubmit={submit} className="tw-panel" aria-label="Tạo lớp">
      <h2>Tạo không gian học tập mới</h2>
      <fieldset disabled={mutation.busy} className="tw-fieldset">
        <div className="clp-field">
          <label htmlFor="class-title">Tên lớp</label>
          <input
            className="clp-input"
            id="class-title"
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ví dụ: Tiếng Trung cơ bản"
          />
        </div>
        <div className="clp-field">
          <label htmlFor="class-term">Học kỳ (không bắt buộc)</label>
          <input
            className="clp-input"
            id="class-term"
            maxLength={40}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Ví dụ: Học kỳ thu 2026"
          />
        </div>
        {mutation.error ? (
          <p className="clp-error" role="alert">
            {mutation.error} Nếu lớp đã được tạo, lớp sẽ xuất hiện khi tải lại trang tổng quan. Hãy
            kiểm tra trước khi gửi lại.
          </p>
        ) : null}
        <div className="clp-actions">
          <button className="clp-button" disabled={!title.trim() || mutation.busy}>
            {mutation.busy ? 'Đang tạo…' : 'Tạo lớp'}
          </button>
          <button className="clp-button clp-button--secondary" type="button" onClick={onCancel}>
            Hủy
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export function AssignmentForm({
  classId,
  studentId,
  onSaved,
  onExpired,
}: {
  classId: string;
  studentId: string;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const courses = useResource(teacherApi.courses, onExpired);
  const [courseId, setCourseId] = useState('');
  return (
    <section className="tw-panel">
      <h2>Giao bài học</h2>
      <p className="clp-muted">
        Chọn nội dung đã xuất bản cho học viên này. Chưa hỗ trợ giao đồng loạt cho cả lớp.
      </p>
      <ResourceView state={courses.state} retry={courses.refresh}>
        {(rows) => (
          <>
            {rows.length ? (
              <div className="clp-field">
                <label htmlFor="assign-course">Khóa học</label>
                <select
                  className="clp-input"
                  id="assign-course"
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                >
                  <option value="">Chọn khóa học</option>
                  {rows.map((row) => (
                    <option key={row.publicId} value={row.publicId}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p>Chưa có khóa học có thể truy cập.</p>
            )}
            {courseId ? (
              <UnitPicker
                key={courseId}
                courseId={courseId}
                classId={classId}
                studentId={studentId}
                onSaved={onSaved}
                onExpired={onExpired}
              />
            ) : null}
          </>
        )}
      </ResourceView>
    </section>
  );
}

function UnitPicker({
  courseId,
  ...props
}: {
  courseId: string;
  classId: string;
  studentId: string;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const load = useCallback(() => teacherApi.units(courseId), [courseId]);
  const units = useResource(load, props.onExpired);
  const [unitId, setUnitId] = useState('');
  return (
    <ResourceView state={units.state} retry={units.refresh}>
      {(rows) => (
        <>
          {rows.length ? (
            <div className="clp-field">
              <label htmlFor="assign-unit">Chương</label>
              <select
                className="clp-input"
                id="assign-unit"
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
              >
                <option value="">Chọn chương</option>
                {rows.map((row) => (
                  <option key={row.publicId} value={row.publicId}>
                    {row.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p>Chưa có chương có thể truy cập trong khóa học này.</p>
          )}
          {unitId ? <LessonPicker key={unitId} unitId={unitId} {...props} /> : null}
        </>
      )}
    </ResourceView>
  );
}

function LessonPicker({
  unitId,
  classId,
  studentId,
  onSaved,
  onExpired,
}: {
  unitId: string;
  classId: string;
  studentId: string;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const load = useCallback(() => teacherApi.lessons(unitId), [unitId]);
  const lessons = useResource(load, onExpired);
  const [lessonId, setLessonId] = useState('');
  const [due, setDue] = useState('');
  const mutation = useMutation(onExpired);
  return (
    <ResourceView state={lessons.state} retry={lessons.refresh}>
      {(rows) => {
        const published = rows.filter((row) => row.visibility === 'PUBLISHED');
        if (!published.length) return <p>Chưa có bài học đã xuất bản trong chương này.</p>;
        return (
          <form
            aria-label="Giao bài học"
            onSubmit={(event) => {
              event.preventDefault();
              if (!published.some((row) => row.publicId === lessonId)) return;
              const instant = due ? new Date(due) : null;
              if (instant && Number.isNaN(instant.getTime())) return;
              void mutation.run(
                () =>
                  teacherApi.assign(classId, studentId, lessonId, instant?.toISOString() ?? null),
                onSaved,
              );
            }}
          >
            <fieldset disabled={mutation.busy} className="tw-fieldset">
              <div className="clp-field">
                <label htmlFor="assign-lesson">Bài học đã xuất bản</label>
                <select
                  id="assign-lesson"
                  className="clp-input"
                  required
                  value={lessonId}
                  onChange={(event) => setLessonId(event.target.value)}
                >
                  <option value="">Chọn bài học</option>
                  {published.map((row) => (
                    <option key={row.publicId} value={row.publicId}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="clp-field">
                <label htmlFor="assign-due">
                  Hạn nộp (không bắt buộc, theo múi giờ địa phương)
                </label>
                <input
                  id="assign-due"
                  className="clp-input"
                  type="datetime-local"
                  value={due}
                  onChange={(event) => setDue(event.target.value)}
                />
              </div>
              {mutation.error ? (
                <p className="clp-error" role="alert">
                  {mutation.error}
                </p>
              ) : null}
              <button className="clp-button" disabled={!lessonId || mutation.busy}>
                {mutation.busy ? 'Đang giao bài…' : 'Giao bài học'}
              </button>
            </fieldset>
          </form>
        );
      }}
    </ResourceView>
  );
}
