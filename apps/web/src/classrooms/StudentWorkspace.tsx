import { useState } from 'react';
import { ApiError, studentApi, type ExerciseView } from '../api/client';
import { classroomApi, classroomError } from '../api/classrooms';
import { useResource } from '../teacher/useResource';
import { displayDate } from '../teacher/model';
import { displayNumber } from '../ui-vi';

type Tab = 'classes' | 'join' | 'assignments' | 'progress';
const tabs: [Tab, string][] = [
  ['classes', 'Lớp của tôi'],
  ['join', 'Tham gia lớp'],
  ['assignments', 'Bài được giao'],
  ['progress', 'Tiến độ'],
];
export function StudentWorkspace({
  onExpired,
  onSelfStudy,
  onExercise,
}: {
  onExpired: () => void;
  onSelfStudy: () => void;
  onExercise: (value: ExerciseView) => void;
}) {
  const [tab, setTab] = useState<Tab>('classes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await studentApi.logout();
      onExpired();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(classroomError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>Không gian học viên</h1>
      <nav className="clp-actions" aria-label="Điều hướng học viên">
        {tabs.map(([id, label]) => (
          <button
            className="clp-button clp-button--secondary"
            key={id}
            disabled={busy}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <button className="clp-button clp-button--secondary" disabled={busy} onClick={onSelfStudy}>
          Tự học
        </button>
        <button
          className="clp-button clp-button--secondary"
          disabled={busy}
          onClick={() => void logout()}
        >
          Đăng xuất
        </button>
      </nav>
      {error ? <p role="alert">{error}</p> : null}
      <StudentSection
        key={tab}
        tab={tab}
        onExpired={onExpired}
        onExercise={onExercise}
        onBusy={setBusy}
      />
    </section>
  );
}

function StudentSection({
  tab,
  onExpired,
  onExercise,
  onBusy,
}: {
  tab: Tab;
  onExpired: () => void;
  onExercise: (value: ExerciseView) => void;
  onBusy: (value: boolean) => void;
}) {
  const classes = useResource(classroomApi.classes, onExpired);
  const assignments = useResource(classroomApi.assignments, onExpired);
  const progress = useResource(classroomApi.progress, onExpired);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function mutate(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(classroomError(err));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const state =
    tab === 'classes' ? classes.state : tab === 'assignments' ? assignments.state : progress.state;
  if (tab !== 'join' && state.status === 'loading')
    return <p role="status">Đang tải dữ liệu lớp học…</p>;
  if (tab !== 'join' && state.status === 'error')
    return (
      <div role="alert">
        <p>{classroomError(state.error)}</p>
        <button
          onClick={() => {
            classes.refresh();
            assignments.refresh();
            progress.refresh();
          }}
        >
          Thử lại
        </button>
      </div>
    );
  return (
    <div aria-busy={busy}>
      {tab === 'join' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(async () => {
              await classroomApi.join(code);
              setCode('');
              setNotice('Đã tham gia lớp. Mở Lớp của tôi để xem.');
            });
          }}
        >
          <h2>Tham gia lớp</h2>
          <label>
            Mã tham gia lớp
            <input
              className="clp-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy}
              required
              maxLength={64}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <p>Xin mã từ giáo viên. Mã có phân biệt chữ hoa, chữ thường và có thời hạn.</p>
          <button className="clp-button" disabled={busy}>
            Tham gia lớp
          </button>
        </form>
      ) : null}
      {tab === 'classes' && classes.state.status === 'ready' ? (
        <>
          <h2>Lớp của tôi</h2>
          {!classes.state.data.classes.length ? (
            <p>Bạn chưa tham gia lớp nào. Hãy xin mã tham gia từ giáo viên.</p>
          ) : (
            classes.state.data.classes.map((row) => (
              <article className="tw-panel" key={row.classId}>
                <h3>{row.title}</h3>
                <p>
                  {row.term || 'Chưa đặt học kỳ'} · Tham gia: {displayDate(row.enrolledAt)}
                </p>
              </article>
            ))
          )}
        </>
      ) : null}
      {tab === 'assignments' && assignments.state.status === 'ready' ? (
        <>
          <h2>Bài được giao</h2>
          <p>
            Chỉ hiển thị bài học đã xuất bản được giao cho bạn trong các lớp đã tham gia. Làm một
            bài tập không đồng nghĩa hoàn thành bài được giao.
          </p>
          {!assignments.state.data.assignments.length ? (
            <p>Chưa có bài được giao có thể truy cập.</p>
          ) : (
            assignments.state.data.assignments.map((row) => (
              <article className="tw-panel" key={row.assignmentId}>
                <h3>{row.lessonTitle}</h3>
                <p>
                  {row.classTitle} · Hạn: {row.dueAt ? displayDate(row.dueAt) : 'Chưa đặt'}
                </p>
                <button
                  className="clp-button"
                  disabled={busy}
                  onClick={() => void mutate(async () => onExercise(await classroomApi.start(row)))}
                >
                  Luyện tập bài được giao
                </button>
              </article>
            ))
          )}
        </>
      ) : null}
      {tab === 'progress' && progress.state.status === 'ready' ? (
        <>
          <h2>Tiến độ</h2>
          <p>
            Dữ liệu trả lời trong {displayNumber(progress.state.data.days)} ngày, thuộc các bài học
            đã xuất bản đang được giao cho bạn. Bao gồm cả lượt tự học cùng bài; đây không phải tỷ
            lệ hoàn thành bài được giao.
          </p>
          <p>
            {displayNumber(progress.state.data.assignedLessons)} bài học ·{' '}
            {displayNumber(progress.state.data.attempts)} lượt trả lời ·{' '}
            {displayNumber(progress.state.data.correct)} đúng ·{' '}
            {displayNumber(progress.state.data.incorrect)} chưa đúng.
          </p>
          {!progress.state.data.attempts ? <p>Chưa có dữ liệu trả lời trong phạm vi này.</p> : null}
        </>
      ) : null}
      {busy ? <p role="status">Đang xử lý, vui lòng chờ…</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
