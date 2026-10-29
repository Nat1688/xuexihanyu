import { displayNumber } from '../ui-vi';
import { useCallback, useState } from 'react';
import { ApiError, studentApi, type Principal } from '../api/client';
import { teacherApi, type TeacherClass, type RosterStudent } from '../api/teacher';
import { canTeach, teacherError } from './model';
import { useResource } from './useResource';
import { ClassCards, ResourceView, Roster, StudentRecord } from './TeacherViews';
import { AssignmentForm, CreateClassForm } from './TeacherForms';
import './teacher.css';
import { ClassEnrollmentPanel } from '../classrooms/ClassEnrollmentPanel';

type Page =
  | { view: 'dashboard' }
  | { view: 'class'; klass: TeacherClass }
  | {
      view: 'student';
      klass: TeacherClass;
      student: RosterStudent;
    };

export function TeacherWorkspace({
  principal,
  onExpired,
  onBusyChange,
}: {
  principal: Principal;
  onExpired: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [page, setPage] = useState<Page>({ view: 'dashboard' });
  const [createBusy, setCreateBusy] = useState(false);
  const busyChanged = useCallback(
    (busy: boolean) => {
      setCreateBusy(busy);
      onBusyChange(busy);
    },
    [onBusyChange],
  );
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      await studentApi.logout();
      onExpired();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setLogoutError(teacherError(error));
    } finally {
      setLogoutBusy(false);
    }
  }
  if (!canTeach(principal))
    return <p role="alert">Tài khoản này không có quyền truy cập giao diện giáo viên.</p>;
  return (
    <fieldset
      className="tw-workspace"
      disabled={createBusy}
      aria-busy={createBusy}
      style={{ minWidth: 0 }}
    >
      <aside className="tw-sidebar">
        <div className="tw-brand">
          <span aria-hidden="true">学</span>
          <div>
            XueXiHanyu<small>KHÔNG GIAN GIÁO VIÊN</small>
          </div>
        </div>
        <nav aria-label="Điều hướng giáo viên">
          <button
            className={page.view === 'dashboard' ? 'tw-nav active' : 'tw-nav'}
            onClick={() => setPage({ view: 'dashboard' })}
          >
            Tổng quan <span aria-hidden="true">↗</span>
          </button>
          <p className="tw-fine">Đồng hành cùng từng lớp, từng học viên.</p>
        </nav>
        <div className="tw-profile">
          <strong>{principal.displayName || principal.login}</strong>
          <small>Không gian giáo viên</small>
          <button
            className="clp-button clp-button--secondary"
            onClick={() => void logout()}
            disabled={logoutBusy}
          >
            {logoutBusy ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </aside>
      <div className="tw-content">
        {logoutError ? (
          <p role="alert" className="clp-error">
            {logoutError} Bạn chưa đăng xuất.
          </p>
        ) : null}
        {page.view !== 'dashboard' ? (
          <nav className="tw-breadcrumb" aria-label="Đường dẫn điều hướng">
            <button onClick={() => setPage({ view: 'dashboard' })}>Tất cả lớp học</button>
            <span aria-hidden="true">/</span>
            {page.view === 'student' ? (
              <button onClick={() => setPage({ view: 'class', klass: page.klass })}>
                {page.klass.title}
              </button>
            ) : (
              <span>{page.klass.title}</span>
            )}
          </nav>
        ) : null}
        {page.view === 'dashboard' ? (
          <Dashboard
            onExpired={onExpired}
            onBusyChange={busyChanged}
            onOpen={(klass) => setPage({ view: 'class', klass })}
          />
        ) : null}
        {page.view === 'class' ? (
          <ClassDetail
            key={page.klass.classId}
            klass={page.klass}
            onExpired={onExpired}
            onBusyChange={busyChanged}
            onOpen={(student) => setPage({ view: 'student', klass: page.klass, student })}
          />
        ) : null}
        {page.view === 'student' ? (
          <StudentPage
            key={`${page.klass.classId}/${page.student.studentId}`}
            classId={page.klass.classId}
            studentId={page.student.studentId}
            onExpired={onExpired}
          />
        ) : null}
      </div>
    </fieldset>
  );
}

function Dashboard({
  onExpired,
  onOpen,
  onBusyChange,
}: {
  onExpired: () => void;
  onOpen: (klass: TeacherClass) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const resource = useResource(teacherApi.classes, onExpired);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  return (
    <>
      <div className="tw-section-heading">
        <div>
          <p className="tw-eyebrow">Tiến bộ từng ngày</p>
          <h1>Không gian giảng dạy</h1>
          <p className="clp-muted">Theo dõi lớp học và hành trình học tập của từng học viên.</p>
        </div>
        <button className="clp-button" onClick={() => setCreating((value) => !value)}>
          {creating ? 'Đóng biểu mẫu' : '+ Tạo lớp'}
        </button>
      </div>
      {notice ? (
        <p role="status" className="tw-notice">
          {notice}
        </p>
      ) : null}
      {creating ? (
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
          }}
        />
      ) : null}
      <ResourceView state={resource.state} retry={resource.refresh}>
        {({ classes }) => (
          <>
            <div className="tw-stats">
              <div>
                <span>Lớp đang hiển thị</span>
                <strong>{displayNumber(classes.length)}</strong>
              </div>
              <div>
                <span>Lượt ghi danh trong các lớp đang hiển thị</span>
                <strong>
                  {displayNumber(classes.reduce((sum, klass) => sum + klass.enrolled, 0))}
                </strong>
              </div>
              <div className="tw-stat-note">
                <span>Quan tâm từng học viên</span>
                <p>Mở lớp để xem bài đã giao và tiến độ dựa trên dữ liệu học tập.</p>
              </div>
            </div>
            <div className="tw-section-heading">
              <h2>Lớp của tôi</h2>
              <button className="clp-button clp-button--secondary" onClick={resource.refresh}>
                Tải lại danh sách lớp
              </button>
            </div>
            <ClassCards classes={classes} onOpen={onOpen} />
            <p className="tw-fine">
              Hiển thị tối đa 50 lớp bạn quản lý. Số lượt ghi danh không phải số học viên duy nhất.
            </p>
          </>
        )}
      </ResourceView>
    </>
  );
}

function ClassDetail({
  klass,
  onExpired,
  onOpen,
  onBusyChange,
}: {
  klass: TeacherClass;
  onExpired: () => void;
  onOpen: (student: RosterStudent) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const load = useCallback(() => teacherApi.roster(klass.classId), [klass.classId]);
  const resource = useResource(load, onExpired);
  return (
    <>
      <p className="tw-eyebrow">Lớp học · {klass.term || 'Chưa đặt học kỳ'}</p>
      <div className="tw-section-heading">
        <h1>{klass.title}</h1>
        <button className="clp-button clp-button--secondary" onClick={resource.refresh}>
          Tải lại danh sách học viên
        </button>
      </div>
      <section className="tw-panel">
        <h2>Học viên</h2>
        <p className="clp-muted">Mở hồ sơ học viên để xem tiến độ hoặc giao bài học đã xuất bản.</p>
        <ResourceView state={resource.state} retry={resource.refresh}>
          {({ students }) => <Roster students={students} onOpen={onOpen} />}
        </ResourceView>
        <p className="tw-fine">
          Hiển thị tối đa 200 học viên đã ghi danh. Máy chủ kiểm tra quyền truy cập hồ sơ.
        </p>
      </section>
      <ClassEnrollmentPanel
        classId={klass.classId}
        onExpired={onExpired}
        onEnrolled={resource.refresh}
        onBusyChange={onBusyChange}
      />
    </>
  );
}

function StudentPage({
  classId,
  studentId,
  onExpired,
}: {
  classId: string;
  studentId: string;
  onExpired: () => void;
}) {
  const load = useCallback(() => teacherApi.detail(classId, studentId), [classId, studentId]);
  const resource = useResource(load, onExpired);
  const [notice, setNotice] = useState('');
  return (
    <>
      <div className="tw-toolbar">
        <button className="clp-button clp-button--secondary" onClick={resource.refresh}>
          Tải lại hồ sơ
        </button>
      </div>
      {notice ? (
        <p role="status" className="tw-notice">
          {notice}
        </p>
      ) : null}
      <ResourceView state={resource.state} retry={resource.refresh}>
        {(detail) => (
          <>
            <StudentRecord detail={detail} />
            <AssignmentForm
              classId={classId}
              studentId={studentId}
              onExpired={onExpired}
              onSaved={() => {
                setNotice('Đã giao bài học.');
                resource.refresh();
              }}
            />
          </>
        )}
      </ResourceView>
    </>
  );
}
