import { useCallback, useEffect, useRef, useState } from 'react';
import { teacherApi, type TeacherClass } from '../api/teacher';
import { displayNumber } from '../ui-vi';
import { CreateClassForm } from './TeacherForms';
import { ClassCards, ResourceView } from './TeacherViews';
import { useResource } from './useResource';

export function TeacherDashboard({
  onExpired,
  onOpen,
  onBusyChange,
  onAuthor,
  onReview,
  onAssign,
}: {
  onExpired: () => void;
  onOpen: (klass: TeacherClass) => void;
  onBusyChange: (busy: boolean) => void;
  onAuthor: () => void;
  onReview: () => void;
  onAssign: () => void;
}) {
  const resource = useResource(teacherApi.classes, onExpired);
  const overview = useResource(teacherApi.overview, onExpired);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const form = useRef<HTMLDivElement>(null);
  const focusCreate = useCallback(() => {
    form.current?.scrollIntoView({ block: 'start' });
    form.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (creating) focusCreate();
  }, [creating, focusCreate]);
  function openCreate() {
    if (creating) focusCreate();
    else setCreating(true);
  }
  return (
    <>
      <div className="tw-section-heading tw-dashboard-heading">
        <div>
          <h1>Không gian giảng dạy</h1>
          <p className="clp-muted">Chuẩn bị bài học, quản lý lớp và theo dõi tiến độ học viên.</p>
        </div>
        <div className="clp-actions">
          <button className="clp-button" onClick={onAuthor}>
            + Soạn bài học
          </button>
          <button
            className="clp-button clp-button--secondary"
            aria-expanded={creating}
            aria-controls="teacher-create-class"
            onClick={() => (creating ? setCreating(false) : openCreate())}
          >
            {creating ? 'Đóng biểu mẫu' : '+ Tạo lớp'}
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="tw-notice">
          {notice}
        </p>
      )}
      <div ref={form} id="teacher-create-class" hidden={!creating}>
        {creating && (
          <CreateClassForm
            onBusyChange={onBusyChange}
            onExpired={onExpired}
            onCancel={() => {
              setCreating(false);
              resource.refresh();
            }}
            onSaved={() => {
              setCreating(false);
              setNotice('Đã tạo lớp.');
              resource.refresh();
              overview.refresh();
            }}
          />
        )}
      </div>
      <ResourceView state={overview.state} retry={overview.refresh}>
        {(data) => {
          const empty = Object.values(data).every((value) => value === 0);
          return (
            <>
              <details className="tw-start" open={empty}>
                <summary>
                  <span>Các bước tổ chức một khóa học</span>
                  <span className="tw-start-hint">Mở hướng dẫn</span>
                </summary>
                <p className="clp-muted">
                  Bắt đầu từ nội dung, sau đó đưa học viên vào lớp và giao bài.
                </p>
                <ol className="tw-steps">
                  {[
                    {
                      title: 'Tạo khóa học',
                      detail: 'Đặt tên khóa và thêm chương.',
                      action: onAuthor,
                    },
                    {
                      title: 'Soạn và xuất bản',
                      detail: 'Chuẩn bị bài để học viên có thể học.',
                      action: onAuthor,
                    },
                    {
                      title: 'Tạo lớp',
                      detail: 'Tổ chức nhóm học viên của bạn.',
                      action: openCreate,
                    },
                    {
                      title: 'Duyệt học sinh',
                      detail: 'Duyệt yêu cầu và xếp vào lớp.',
                      action: onReview,
                    },
                    {
                      title: 'Giao bài',
                      detail: 'Chọn lớp, bài học và hạn nộp.',
                      action: onAssign,
                    },
                  ].map((step, index) => (
                    <li key={step.title}>
                      <button onClick={step.action}>
                        <span className="tw-step-number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <strong>{step.title}</strong>
                        <span>{step.detail}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
              {empty ? (
                <p className="tw-dashboard-note">
                  Chưa có dữ liệu thống kê. Bắt đầu với khóa học hoặc lớp đầu tiên ở trên.
                </p>
              ) : (
                <section aria-label="Thống kê giảng dạy">
                  <div className="tw-stats">
                    {[
                      ['Lớp học', data.classes],
                      ['Học viên duy nhất', data.students],
                      ['Bài học đã xuất bản', data.lessons],
                      ['Lượt giao bài', data.assignments],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{displayNumber(Number(value))}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="tw-overview-summary">
                    <span>
                      Khóa học của tôi <strong>{displayNumber(data.courses)}</strong>
                    </span>
                    <span>
                      Chưa hoàn thành <strong>{displayNumber(data.pending)}</strong>
                    </span>
                    <span>
                      Đã hoàn thành <strong>{displayNumber(data.completed)}</strong>
                    </span>
                  </div>
                  <p className="tw-fine">
                    Lượt giao bài và trạng thái hoàn thành được tính riêng cho từng học viên trong
                    lớp bạn quản lý.
                  </p>
                </section>
              )}
            </>
          );
        }}
      </ResourceView>
      <section className="tw-dashboard-classes" aria-labelledby="teacher-classes-title">
        <div className="tw-section-heading">
          <div>
            <h2 id="teacher-classes-title">Lớp của tôi</h2>
            <p className="clp-muted">Mở lớp để giao bài và xem kết quả học tập.</p>
          </div>
          <button
            className="clp-button clp-button--secondary"
            onClick={() => {
              resource.refresh();
              overview.refresh();
            }}
          >
            Tải lại danh sách lớp
          </button>
        </div>
        <ResourceView state={resource.state} retry={resource.refresh}>
          {({ classes }) => (
            <>
              <ClassCards classes={classes} onOpen={onOpen} onCreate={openCreate} />
              {classes.length > 0 && <p className="tw-fine">Hiển thị tối đa 50 lớp bạn quản lý.</p>}
            </>
          )}
        </ResourceView>
      </section>
    </>
  );
}
