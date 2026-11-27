import { classroomApi, classroomError } from '../api/classrooms';
import { useResource, type Resource } from '../teacher/useResource';
import { displayDate } from '../teacher/model';
import { displayNumber } from '../ui-vi';
import { InkArtwork } from '../InkArtwork';

function DataState<T>({
  state,
  retry,
  children,
}: {
  state: Resource<T>;
  retry: () => void;
  children: (value: T) => React.ReactNode;
}) {
  if (state.status === 'loading') return <p role="status">Đang tải tiến độ học tập…</p>;
  if (state.status === 'error')
    return (
      <div role="alert" className="clp-error">
        <p>{classroomError(state.error)}</p>
        <button className="clp-button clp-button--secondary" onClick={retry}>
          Thử lại
        </button>
      </div>
    );
  return children(state.data);
}

export function StudentDashboard({
  onExpired,
  onAssignments,
  onClasses,
  onCourses,
  onProgress,
  onResult,
  onFlashcards,
}: {
  onExpired: () => void;
  onAssignments: () => void;
  onClasses: () => void;
  onCourses: () => void;
  onProgress: () => void;
  onResult: (sessionId: string) => void;
  onFlashcards: () => void;
}) {
  const classes = useResource(classroomApi.classes, onExpired);
  const assignments = useResource(classroomApi.assignments, onExpired);
  const progress = useResource(classroomApi.progress, onExpired);
  return (
    <section aria-labelledby="student-overview-heading">
      <div className="tw-section-heading">
        <div>
          <h2 id="student-overview-heading">Tổng quan học tập</h2>
          <p className="clp-muted">
            Bài được giao, kết quả luyện tập và những bước tiếp theo của bạn.
          </p>
        </div>
        <button
          className="clp-button clp-button--secondary"
          onClick={() => {
            classes.refresh();
            assignments.refresh();
            progress.refresh();
          }}
        >
          Cập nhật tiến độ
        </button>
      </div>
      <DataState state={classes.state} retry={classes.refresh}>
        {(data) => (
          <div className="ink-dashboard-class-summary">
            <span>
              <strong>{displayNumber(data.classes.length)}</strong> lớp đang tham gia
            </span>
            <button className="clp-button clp-button--secondary" onClick={onClasses}>
              Xem lớp của tôi
            </button>
          </div>
        )}
      </DataState>
      <div className="fc-dashboard-entry">
        <div>
          <h3>Ôn từ vựng với flashcard</h3>
          <p>Lật thẻ, đối chiếu nghĩa và tự ôn lại những từ chưa nhớ.</p>
        </div>
        <button className="clp-button" onClick={onFlashcards}>
          Mở flashcard ôn tập
        </button>
      </div>
      <DataState state={assignments.state} retry={assignments.refresh}>
        {(data) => {
          const completed = data.assignments.filter((row) => row.completion?.completed).length;
          const pending = data.assignments.filter(
            (row) => row.completion && !row.completion.completed,
          );
          const unknown = data.assignments.filter((row) => !row.completion).length;
          return (
            <>
              <dl className="ink-dashboard-metrics">
                <div>
                  <dt>Bài được giao có thể truy cập</dt>
                  <dd>{displayNumber(data.assignments.length)}</dd>
                </div>
                <div>
                  <dt>Đã hoàn thành</dt>
                  <dd>{displayNumber(completed)}</dd>
                </div>
                <div>
                  <dt>Chưa hoàn thành</dt>
                  <dd>{displayNumber(pending.length)}</dd>
                </div>
              </dl>
              {unknown > 0 ? (
                <p className="clp-muted">
                  {displayNumber(unknown)} bài chưa có trạng thái hoàn thành; chưa tính vào hai số
                  liệu hoàn thành ở trên.
                </p>
              ) : null}
              <p className="tw-fine">
                Hoàn thành bài được giao không phải chỉ số thành thạo. Chỉ tính các bài đã xuất bản
                mà bạn đang có quyền truy cập.
              </p>
              <div className="ink-dashboard-next">
                <InkArtwork kind="landscape" />
                <p className="ink-eyebrow">Bước tiếp theo</p>
                <h3>
                  {pending[0]?.lessonTitle ||
                    (data.assignments.length
                      ? 'Tiếp tục ôn tập theo nhịp của bạn'
                      : 'Bắt đầu hành trình học tiếng Trung')}
                </h3>
                <p>
                  {pending[0]
                    ? `Từ lớp ${pending[0].classTitle}`
                    : data.assignments.length
                      ? 'Mở danh sách bài để xem nội dung và kết quả đã lưu.'
                      : 'Đăng ký khóa học và chờ giáo viên duyệt. Khi được giao bài, bạn sẽ thấy bài tại đây.'}
                </p>
                <button
                  className="clp-button"
                  onClick={data.assignments.length ? onAssignments : onCourses}
                >
                  {data.assignments.length ? 'Xem bài được giao →' : 'Tìm khóa học →'}
                </button>
              </div>
            </>
          );
        }}
      </DataState>
      <section className="ink-dashboard-progress" aria-label="Kết quả luyện tập">
        <h3>Kết quả luyện tập</h3>
        <DataState state={progress.state} retry={progress.refresh}>
          {(data) => (
            <>
              <p className="clp-muted">
                Trong {displayNumber(data.days)} ngày: các lượt trả lời thuộc bài đã xuất bản đang
                được giao, bao gồm lượt tự học cùng bài. Không bao gồm toàn bộ lịch sử tự học.
              </p>
              <dl className="ink-dashboard-metrics">
                <div>
                  <dt>Lượt trả lời</dt>
                  <dd>{displayNumber(data.attempts)}</dd>
                </div>
                <div>
                  <dt>Trả lời đúng</dt>
                  <dd>{displayNumber(data.correct)}</dd>
                </div>
                <div>
                  <dt>Cần luyện thêm</dt>
                  <dd>{displayNumber(data.incorrect)}</dd>
                </div>
              </dl>
              {!data.attempts ? (
                <p>
                  Bạn chưa có lượt trả lời trong phạm vi này. Tiến độ sẽ cập nhật sau khi bạn luyện
                  tập.
                </p>
              ) : null}
              <h3>Kết quả gần đây</h3>
              {data.recentResults?.length ? (
                <ul className="ink-dashboard-history">
                  {data.recentResults.slice(0, 5).map((row) => (
                    <li key={row.sessionId}>
                      <div>
                        <strong>{row.lessonTitle}</strong>
                        <small>
                          {displayDate(row.submittedAt)} · {row.correct ? 'Đúng' : 'Chưa đúng'}
                        </small>
                      </div>
                      <button
                        className="clp-button clp-button--secondary"
                        onClick={() => onResult(row.sessionId)}
                      >
                        Xem kết quả
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="clp-muted">Chưa có kết quả gần đây để hiển thị.</p>
              )}
              <button className="clp-button clp-button--secondary" onClick={onProgress}>
                Xem chi tiết tiến độ
              </button>
            </>
          )}
        </DataState>
      </section>
    </section>
  );
}
