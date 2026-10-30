import { learningState, displayNumber, displayPercent } from '../ui-vi';
import type { ReactNode } from 'react';
import type { StudentDetail, TeacherClass, RosterStudent } from '../api/teacher';
import { displayDate, teacherError } from './model';
import type { Resource } from './useResource';

export function ResourceView<T>({
  state,
  retry,
  children,
}: {
  state: Resource<T>;
  retry: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading')
    return (
      <div className="tw-empty" role="status">
        Đang tải không gian làm việc…
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="clp-error" role="alert">
        <p>{teacherError(state.error)}</p>
        <button className="clp-button clp-button--secondary" onClick={retry}>
          Thử lại
        </button>
      </div>
    );
  return <>{children(state.data)}</>;
}

export function ClassCards({
  classes,
  onOpen,
  actionLabel = 'Xem lớp',
}: {
  actionLabel?: string;
  classes: TeacherClass[];
  onOpen: (value: TeacherClass) => void;
}) {
  if (!classes.length)
    return (
      <div className="tw-empty">
        <h2>Bắt đầu với lớp học mới</h2>
        <p>Tạo lớp để bắt đầu. Chỉ các lớp bạn quản lý mới xuất hiện ở đây.</p>
      </div>
    );
  return (
    <div className="tw-class-grid">
      {classes.map((klass, index) => (
        <button className="tw-class-card" key={klass.classId} onClick={() => onOpen(klass)}>
          <span className="tw-class-mark" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="tw-tag">{klass.term || 'Chưa đặt học kỳ'}</span>
          <span className="tw-class-title">{klass.title}</span>
          <span className="clp-muted">
            {displayNumber(klass.enrolled)} lượt ghi danh · {actionLabel}{' '}
            <span aria-hidden="true">↗</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Roster({
  students,
  onOpen,
}: {
  students: RosterStudent[];
  onOpen: (value: RosterStudent) => void;
}) {
  if (!students.length)
    return (
      <div className="tw-empty">
        <h3>Chưa có học viên ghi danh</h3>
        <p>Lớp chưa có học viên. Hãy chia sẻ mã tham gia hoặc thêm tài khoản học viên có sẵn.</p>
      </div>
    );
  return (
    <div className="tw-table-wrap">
      <table className="tw-table">
        <caption className="tw-sr-only">Danh sách học viên</caption>
        <thead>
          <tr>
            <th>Học viên</th>
            <th>Ngày ghi danh</th>
            <th>Hồ sơ học tập</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId}>
              <td>
                <strong>{student.displayName || student.login}</strong>
                {student.displayName ? <small>{student.login}</small> : null}
              </td>
              <td>{displayDate(student.enrolledAt)}</td>
              <td>
                <button
                  className="clp-button clp-button--secondary"
                  onClick={() => onOpen(student)}
                >
                  Xem tiến độ
                  <span className="tw-sr-only"> của {student.displayName || student.login}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudentRecord({ detail }: { detail: StudentDetail }) {
  const evidence = detail.progress.evidence;
  return (
    <>
      <div className="tw-section-heading">
        <div>
          <p className="tw-eyebrow">Hồ sơ học tập</p>
          <h1>{detail.displayName || detail.login}</h1>
        </div>
        <span className="tw-tag">{displayNumber(evidence.window.days)} ngày gần nhất</span>
      </div>
      <p className="clp-muted">
        Dữ liệu từ các bài học được giao trong lớp này. Chỉ để tham khảo — không phải điểm số.
      </p>
      <div className="tw-stats">
        <div>
          <span>Lượt làm bài</span>
          <strong>{displayNumber(evidence.attempts)}</strong>
        </div>
        <div>
          <span>Câu trả lời đúng</span>
          <strong>{displayNumber(evidence.correct)}</strong>
        </div>
        <div>
          <span>Tỷ lệ chính xác</span>
          <strong>{evidence.accuracy === null ? '—' : displayPercent(evidence.accuracy)}</strong>
        </div>
        <div>
          <span>Bài học đã giao</span>
          <strong>{displayNumber(evidence.assignedLessons)}</strong>
        </div>
      </div>
      {!evidence.totalEvents ? (
        <p className="tw-notice">
          Chưa có dữ liệu học tập trong khoảng thời gian này. Điều này không có nghĩa học viên không
          đạt hoặc đã hoàn thành bài được giao.
        </p>
      ) : null}
      <p className="tw-fine">
        Khoảng thời gian: {displayDate(evidence.window.from)} – {displayDate(evidence.window.to)}{' '}
        (không bao gồm thời điểm kết thúc). Ngày giờ theo múi giờ địa phương của trình duyệt.
      </p>
      <section className="tw-panel">
        <h2>Bài học đã giao</h2>
        {!detail.assignments.length ? (
          <p className="clp-muted">Chưa có bài học được giao.</p>
        ) : (
          <ul className="tw-rows">
            {detail.assignments.map((assignment) => (
              <li key={assignment.assignmentId}>
                <strong>{assignment.lessonTitle}</strong>
                {assignment.completion ? (
                  <span>
                    {assignment.completion.completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'} ·{' '}
                    {assignment.completion.correct}/{assignment.completion.total} mục đúng ít nhất
                    một lần
                  </span>
                ) : null}
                <span>{displayDate(assignment.dueAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="tw-fine">
          Hoàn thành khi đã trả lời đúng mỗi mục luyện tập ít nhất một lần. Lịch sử tự học cùng bài
          được tính; bài không có mục luyện tập chưa được coi là hoàn thành.
        </p>
      </section>
      <div className="tw-columns">
        <section className="tw-panel">
          <h2>Thông tin luyện tập</h2>
          <p className="tw-fine">
            Hiển thị tối đa 10 mục luyện tập. Mục chưa có tên được đánh số để tham khảo; đây không
            phải điểm đánh giá của giáo viên.
          </p>
          {!detail.progress.weakItems.length ? (
            <p className="clp-muted">Chưa có thông tin luyện tập.</p>
          ) : (
            <ul className="tw-rows">
              {detail.progress.weakItems.map((item, index) => (
                <li key={item.itemId}>
                  <div>
                    <strong>Mục {index + 1}</strong>
                    <small>
                      {displayNumber(item.correct)} đúng · {displayNumber(item.incorrect)} sai trong
                      khoảng thời gian
                    </small>
                  </div>
                  <span className="tw-tag">{learningState(item.state)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tw-panel">
          <h2>Hoạt động gần đây</h2>
          <p className="tw-fine">Tối đa 20 sự kiện trong khoảng thời gian này.</p>
          {!detail.recentEvidence.length ? (
            <p className="clp-muted">Chưa có hoạt động gần đây.</p>
          ) : (
            <ul className="tw-rows">
              {detail.recentEvidence.map((event) => (
                <li key={event.eventId}>
                  <div>
                    <strong>
                      {detail.assignments.find(
                        (assignment) => assignment.lessonId === event.lessonId,
                      )?.lessonTitle || 'Hoạt động trong bài đã giao'}
                    </strong>
                    <small>{displayDate(event.occurredAt)}</small>
                  </div>
                  <span className="tw-tag">
                    {event.accepted === null ? 'Hoạt động' : event.accepted ? 'Đúng' : 'Sai'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
