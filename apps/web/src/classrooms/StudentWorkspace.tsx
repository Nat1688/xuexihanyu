import { CourseAdmissions } from '../admissions/CourseAdmissions';
import { PublishedLesson } from '../curriculum/Lesson';
import type { ClassAssignment } from '../api/classrooms';
import { useEffect, useState } from 'react';
import { ApiError, studentApi, type ResultView, type ExerciseView } from '../api/client';
import { classroomApi, classroomError } from '../api/classrooms';
import { useResource } from '../teacher/useResource';
import { displayDate } from '../teacher/model';
import { displayNumber } from '../ui-vi';

function stored(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* Storage may be disabled. Server access remains authoritative. */
  }
}
type Tab = 'courses' | 'classes' | 'join' | 'assignments' | 'progress';
const tabs: [Tab, string][] = [
  ['courses', 'Đăng ký khóa học'],
  ['classes', 'Lớp của tôi'],
  ['join', 'Tham gia lớp'],
  ['assignments', 'Bài được giao'],
  ['progress', 'Tiến độ'],
];
export function StudentWorkspace({
  onExpired,
  onSelfStudy,
  onExercise,
  accountId,
  onResult,
  onTools,
}: {
  onTools?: () => void;
  accountId?: string;
  onResult?: (result: ResultView) => void;
  onExpired: () => void;
  onSelfStudy: () => void;
  onExercise: (value: ExerciseView) => void;
}) {
  const resumeKey = accountId ? `xuexihanyu:reading:${accountId}` : '';
  const [tab, setTab] = useState<Tab>(() =>
    resumeKey && stored(resumeKey) ? 'assignments' : 'courses',
  );
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
    <section className="student-workspace">
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
        {onTools ? (
          <button
            type="button"
            className="clp-button clp-button--secondary"
            data-learning-tools-trigger
            disabled={busy}
            onClick={onTools}
          >
            Công cụ học tập
          </button>
        ) : null}
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
      {tab === 'courses' ? (
        <CourseAdmissions onExpired={onExpired} />
      ) : (
        <StudentSection
          key={tab}
          tab={tab}
          onResult={onResult}
          resumeKey={resumeKey}
          onExpired={onExpired}
          onExercise={onExercise}
          onBusy={setBusy}
        />
      )}
    </section>
  );
}

function StudentSection({
  tab,
  onExpired,
  onExercise,
  onBusy,
  resumeKey,
  onResult,
}: {
  resumeKey: string;
  onResult?: (result: ResultView) => void;
  tab: Tab;
  onExpired: () => void;
  onExercise: (value: ExerciseView) => void;
  onBusy: (value: boolean) => void;
}) {
  const classes = useResource(classroomApi.classes, onExpired);
  const assignments = useResource(classroomApi.assignments, onExpired);
  const progress = useResource(classroomApi.progress, onExpired);
  const [reading, setReading] = useState<ClassAssignment | null>(null);
  useEffect(() => {
    if (tab !== 'assignments' || assignments.state.status !== 'ready' || !resumeKey) return;
    const id = stored(resumeKey);
    if (!id) return;
    const authorized = assignments.state.data.assignments.find((row) => row.assignmentId === id);
    if (authorized) setReading(authorized);
    else remember(resumeKey, null);
  }, [tab, assignments.state, resumeKey]);
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
  if (reading)
    return (
      <>
        {error ? <p role="alert">{error}</p> : null}
        <PublishedLesson
          id={reading.lessonId}
          resumeKey={resumeKey ? `${resumeKey}:${reading.assignmentId}:position` : undefined}
          onExpired={onExpired}
          onBack={() => {
            setReading(null);
            if (resumeKey) remember(resumeKey, null);
          }}
          onPractice={() => void mutate(async () => onExercise(await classroomApi.start(reading)))}
        />
      </>
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
          {assignments.state.status === 'ready' && progress.state.status === 'ready' ? (
            <div className="tw-stats">
              <div>
                <span>Lớp đang tham gia</span>
                <strong>{displayNumber(classes.state.data.classes.length)}</strong>
              </div>
              <div>
                <span>Bài chưa hoàn thành</span>
                <strong>
                  {displayNumber(
                    assignments.state.data.assignments.filter((row) => !row.completion?.completed)
                      .length,
                  )}
                </strong>
              </div>
              <div>
                <span>Lượt luyện tập · 30 ngày</span>
                <strong>{displayNumber(progress.state.data.attempts)}</strong>
              </div>
            </div>
          ) : null}
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
            Chỉ hiển thị bài học đã xuất bản được giao cho bạn trong các lớp đã tham gia. Hoàn thành
            khi đã trả lời đúng mỗi mục luyện tập ít nhất một lần.
          </p>
          {!assignments.state.data.assignments.length ? (
            <p>Chưa có bài được giao có thể truy cập.</p>
          ) : (
            assignments.state.data.assignments.map((row) => (
              <article className="tw-panel" key={row.assignmentId}>
                <h3>{row.lessonTitle}</h3>
                {row.completion ? (
                  <p>
                    {row.completion.completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'} ·{' '}
                    {row.completion.correct}/{row.completion.total} mục luyện tập đã trả lời đúng
                  </p>
                ) : null}
                <p>
                  {row.classTitle} · Hạn: {row.dueAt ? displayDate(row.dueAt) : 'Chưa đặt'}
                </p>
                <button
                  className="clp-button clp-button--secondary"
                  disabled={busy}
                  onClick={() => {
                    setReading(row);
                    if (resumeKey) remember(resumeKey, row.assignmentId);
                  }}
                >
                  Mở bài học
                </button>
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
          <h3>Lịch sử luyện tập gần đây</h3>
          <p className="clp-muted">
            Tối đa 20 lượt đã lưu trong 30 ngày. Mở lại để xem đáp án và kết quả.
          </p>
          {progress.state.data.recentResults?.map((row) => (
            <article className="tw-panel" key={row.sessionId}>
              <strong>{row.lessonTitle}</strong>
              <p>
                {row.correct ? 'Đúng' : 'Chưa đúng'} · {displayDate(row.submittedAt)}
              </p>
              <button
                className="clp-button clp-button--secondary"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => onResult?.(await studentApi.result(row.sessionId)))
                }
              >
                Xem kết quả
              </button>
            </article>
          ))}
          {!progress.state.data.attempts ? <p>Chưa có dữ liệu trả lời trong phạm vi này.</p> : null}
        </>
      ) : null}
      {busy ? <p role="status">Đang xử lý, vui lòng chờ…</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
