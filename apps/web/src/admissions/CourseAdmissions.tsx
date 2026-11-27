import { useState } from 'react';
import { ApiError } from '../api/client';
import { useResource } from '../teacher/useResource';
import { admissionsApi, currentApplication, type Application } from './api';
const labels = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};
function message(error: unknown) {
  return error instanceof ApiError ? error.message : 'Không thể tải yêu cầu. Vui lòng thử lại.';
}
export function CourseAdmissions({ onExpired }: { onExpired: () => void }) {
  const { state, refresh } = useResource(admissionsApi.catalog, onExpired);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function act(operation: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="course-admissions-title">
      <h2 id="course-admissions-title">Đăng ký khóa học</h2>
      <p>Chọn khóa học để gửi yêu cầu. Khi được duyệt, bạn sẽ được xếp lớp và có thể vào học.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {state.status === 'loading' ? (
        <p role="status">Đang tải khóa học…</p>
      ) : state.status === 'error' ? (
        <div role="alert">
          {message(state.error)} <button onClick={refresh}>Thử lại</button>
        </div>
      ) : (
        <>
          {state.data.courses.length === 0 && <p>Hiện chưa có khóa học mở đăng ký.</p>}
          <div className="learning-tools-grid">
            {state.data.courses.map((course) => {
              const current = currentApplication(state.data.applications, course.publicId);
              return (
                <article className="clp-card" key={course.publicId}>
                  <h3>{course.title}</h3>
                  <p>{course.description}</p>
                  {current && (
                    <p>
                      <strong>{labels[current.status]}</strong>
                      {current.class && ` · Lớp: ${current.class.title}`}
                    </p>
                  )}
                  {current?.reason && <p>Lý do: {current.reason}</p>}
                  {current?.status === 'PENDING' ? (
                    <button
                      className="clp-button clp-button--secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(() => admissionsApi.cancel(current.publicId), 'Đã hủy yêu cầu.')
                      }
                    >
                      Hủy yêu cầu
                    </button>
                  ) : current?.status === 'APPROVED' ? (
                    <p>Bạn có thể mở Tự học hoặc Bài được giao.</p>
                  ) : (
                    <button
                      className="clp-button"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => admissionsApi.apply(course.publicId),
                          'Đã gửi yêu cầu. Vui lòng chờ duyệt.',
                        )
                      }
                    >
                      {current ? 'Gửi lại yêu cầu' : 'Xin tham gia khóa học'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <details>
            <summary>Lịch sử yêu cầu ({state.data.applications.length})</summary>
            {state.data.applications.map((a) => (
              <p key={a.publicId}>
                {a.course.title} · {labels[a.status]}
                {a.class && ` · ${a.class.title}`}
                {a.reason && ` · ${a.reason}`}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
export function AdmissionReviews({
  onExpired,
  onBusyChange,
}: {
  onExpired: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { state, refresh } = useResource(admissionsApi.review, onExpired);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function decide(
    row: Application,
    decision: 'APPROVED' | 'REJECTED',
    classId: string,
    reason: string,
  ) {
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setNotice('');
    try {
      await admissionsApi.decide(row.publicId, decision, classId, reason);
      setNotice(
        decision === 'APPROVED' ? 'Đã duyệt và xếp lớp cho học sinh.' : 'Đã từ chối yêu cầu.',
      );
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(message(e));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section>
      <h1>Duyệt đăng ký khóa học</h1>
      <p>
        Kiểm tra khóa học, chọn lớp rồi duyệt. Giáo viên chỉ duyệt khóa học và xếp vào lớp mình phụ
        trách; Admin duyệt tất cả.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button className="clp-button clp-button--secondary" disabled={busy} onClick={refresh}>
        Tải lại danh sách
      </button>
      {state.status === 'loading' ? (
        <p role="status">Đang tải yêu cầu…</p>
      ) : state.status === 'error' ? (
        <p role="alert">{message(state.error)}</p>
      ) : (
        <>
          <h2>Chờ duyệt</h2>
          {!state.data.applications.some((a) => a.status === 'PENDING') && (
            <p>Không có yêu cầu đang chờ duyệt.</p>
          )}
          {state.data.applications
            .filter((a) => a.status === 'PENDING')
            .map((row) => (
              <ReviewRow
                key={row.publicId}
                row={row}
                classes={state.data.classes}
                busy={busy}
                decide={decide}
              />
            ))}
          <details>
            <summary>Yêu cầu đã xử lý</summary>
            {state.data.applications
              .filter((a) => a.status !== 'PENDING')
              .map((a) => (
                <p key={a.publicId}>
                  {a.student.login} · {a.course.title} · {labels[a.status]}
                  {a.class && ` · ${a.class.title}`}
                  {a.reason && ` · ${a.reason}`}
                </p>
              ))}
          </details>
        </>
      )}
    </section>
  );
}
function ReviewRow({
  row,
  classes,
  busy,
  decide,
}: {
  row: Application;
  classes: { publicId: string; title: string }[];
  busy: boolean;
  decide: (
    row: Application,
    decision: 'APPROVED' | 'REJECTED',
    classId: string,
    reason: string,
  ) => Promise<void>;
}) {
  const [classId, setClassId] = useState(''),
    [reason, setReason] = useState('');
  return (
    <article className="clp-card">
      <h3>{row.course.title}</h3>
      <p>Học sinh: {row.student.login}</p>
      <div className="clp-field">
        <label htmlFor={`class-${row.publicId}`}>Xếp vào lớp</label>
        <select
          id={`class-${row.publicId}`}
          className="clp-input"
          value={classId}
          disabled={busy}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Chọn lớp…</option>
          {classes.map((c) => (
            <option key={c.publicId} value={c.publicId}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      {!classes.length && <p>Tạo lớp trong Tổng quan trước khi duyệt.</p>}
      <div className="clp-field">
        <label htmlFor={`reason-${row.publicId}`}>Ghi chú / lý do (không bắt buộc)</label>
        <textarea
          id={`reason-${row.publicId}`}
          className="clp-input"
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="clp-actions">
        <button
          className="clp-button"
          disabled={busy || !classId}
          onClick={() => void decide(row, 'APPROVED', classId, reason)}
        >
          Duyệt và xếp lớp
        </button>
        <button
          className="clp-button clp-button--secondary"
          disabled={busy}
          onClick={() => void decide(row, 'REJECTED', '', reason)}
        >
          Từ chối
        </button>
      </div>
    </article>
  );
}
