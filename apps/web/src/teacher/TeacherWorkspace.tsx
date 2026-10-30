import { AdmissionReviews } from '../admissions/CourseAdmissions';
import { Curriculum } from '../curriculum/Curriculum';
import { displayNumber } from '../ui-vi';
import { useCallback, useEffect, useState } from 'react';
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
  | { view: 'curriculum' }
  | { view: 'assign' }
  | { view: 'admissions' }
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
  onTools,
}: {
  onTools?: () => void;
  principal: Principal;
  onExpired: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [page, setPage] = useState<Page>({ view: 'dashboard' });
  const [curriculumKey, setCurriculumKey] = useState(0);
  const [returnClass, setReturnClass] = useState<TeacherClass | null>(null);
  const [dirty, setDirty] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const busyChanged = useCallback((busy: boolean) => setCreateBusy(busy), []);
  useEffect(() => {
    onBusyChange(createBusy || dirty);
  }, [createBusy, dirty, onBusyChange]);
  function navigate(next: Page) {
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Rời trình soạn bài?')) return false;
    setDirty(false);
    if (next.view === 'curriculum' && page.view === 'curriculum')
      setCurriculumKey((value) => value + 1);
    setPage(next);
    return true;
  }
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  async function logout() {
    if (logoutBusy || createBusy) return;
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Đăng xuất?')) return;
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
            onClick={() => navigate({ view: 'dashboard' })}
          >
            Tổng quan <span aria-hidden="true">↗</span>
          </button>
          <button
            className={page.view === 'curriculum' ? 'tw-nav active' : 'tw-nav'}
            onClick={() => {
              if (navigate({ view: 'curriculum' })) setReturnClass(null);
            }}
          >
            Khóa học & bài học <span aria-hidden="true">文</span>
          </button>
          <button
            className={page.view === 'assign' ? 'tw-nav active' : 'tw-nav'}
            onClick={() => navigate({ view: 'assign' })}
          >
            Giao bài <span aria-hidden="true">→</span>
          </button>
          <button
            className={page.view === 'admissions' ? 'tw-nav active' : 'tw-nav'}
            onClick={() => navigate({ view: 'admissions' })}
          >
            Duyệt đăng ký
          </button>
          {onTools ? (
            <button type="button" className="tw-nav" data-learning-tools-trigger onClick={onTools}>
              Công cụ học tập <span aria-hidden="true">拼</span>
            </button>
          ) : null}
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
        {page.view !== 'dashboard' &&
        page.view !== 'curriculum' &&
        page.view !== 'assign' &&
        page.view !== 'admissions' ? (
          <nav className="tw-breadcrumb" aria-label="Đường dẫn điều hướng">
            <button onClick={() => navigate({ view: 'dashboard' })}>Tất cả lớp học</button>
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
        {page.view === 'admissions' ? (
          <AdmissionReviews onExpired={onExpired} onBusyChange={busyChanged} />
        ) : null}
        {page.view === 'curriculum' ? (
          <Curriculum
            key={curriculumKey}
            onExpired={onExpired}
            onDirtyChange={setDirty}
            onBusyChange={busyChanged}
            onAssign={() =>
              navigate(returnClass ? { view: 'class', klass: returnClass } : { view: 'assign' })
            }
          />
        ) : null}
        {page.view === 'assign' ? (
          <AssignmentClassPicker
            onExpired={onExpired}
            onAuthor={() => {
              setReturnClass(null);
              navigate({ view: 'curriculum' });
            }}
            onOpen={(klass) => setPage({ view: 'class', klass })}
          />
        ) : null}
        {page.view === 'dashboard' ? (
          <Dashboard
            onExpired={onExpired}
            onAuthor={() => {
              if (navigate({ view: 'curriculum' })) setReturnClass(null);
            }}
            onBusyChange={busyChanged}
            onOpen={(klass) => setPage({ view: 'class', klass })}
          />
        ) : null}
        {page.view === 'class' ? (
          <ClassDetail
            key={page.klass.classId}
            klass={page.klass}
            onExpired={onExpired}
            onAuthor={() => {
              setReturnClass(page.klass);
              navigate({ view: 'curriculum' });
            }}
            onBusyChange={busyChanged}
            onOpen={(student) => setPage({ view: 'student', klass: page.klass, student })}
          />
        ) : null}
        {page.view === 'student' ? (
          <StudentPage
            key={`${page.klass.classId}/${page.student.studentId}`}
            classId={page.klass.classId}
            studentId={page.student.studentId}
            onBusyChange={busyChanged}
            onAuthor={() => {
              setReturnClass(page.klass);
              navigate({ view: 'curriculum' });
            }}
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
  onAuthor,
}: {
  onAuthor: () => void;
  onExpired: () => void;
  onOpen: (klass: TeacherClass) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const resource = useResource(teacherApi.classes, onExpired);
  const overview = useResource(teacherApi.overview, onExpired);
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
      <p className="clp-actions">
        <button className="clp-button" onClick={onAuthor}>
          + Soạn bài học
        </button>
        <span className="clp-muted">
          Soạn và xuất bản bài trước, sau đó mở lớp bên dưới để giao cho học viên.
        </span>
      </p>
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
            overview.refresh();
          }}
        />
      ) : null}
      <ResourceView state={overview.state} retry={overview.refresh}>
        {(data) => (
          <>
            <div className="tw-stats">
              {(
                [
                  ['Khóa học của tôi', data.courses],
                  ['Lớp học', data.classes],
                  ['Học viên duy nhất', data.students],
                  ['Bài học đã xuất bản', data.lessons],
                  ['Lượt giao bài', data.assignments],
                  ['Chưa hoàn thành', data.pending],
                  ['Đã hoàn thành', data.completed],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{displayNumber(value)}</strong>
                </div>
              ))}
            </div>
            <p className="tw-fine">
              Tổng số trong các lớp bạn sở hữu; lượt giao bài tính riêng từng học viên. Trạng thái
              hoàn thành theo các mục luyện tập hiện tại.
            </p>
          </>
        )}
      </ResourceView>
      <ResourceView state={resource.state} retry={resource.refresh}>
        {({ classes }) => (
          <>
            <div className="tw-section-heading">
              <h2>Lớp của tôi</h2>
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
  klass: initialClass,
  onExpired,
  onOpen,
  onBusyChange,
  onAuthor,
}: {
  klass: TeacherClass;
  onAuthor: () => void;
  onExpired: () => void;
  onOpen: (student: RosterStudent) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [klass, setKlass] = useState(initialClass);
  const load = useCallback(() => teacherApi.roster(klass.classId), [klass.classId]);
  const resource = useResource(load, onExpired);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <>
      <p className="tw-eyebrow">Lớp học · {klass.term || 'Chưa đặt học kỳ'}</p>
      <div className="tw-section-heading">
        <h1>{klass.title}</h1>
        <button className="clp-button clp-button--secondary" onClick={() => setEditing(!editing)}>
          Chỉnh sửa lớp học
        </button>
        <button className="clp-button clp-button--secondary" onClick={resource.refresh}>
          Tải lại danh sách học viên
        </button>
      </div>
      {editing ? (
        <CreateClassForm
          initialClass={klass}
          onExpired={onExpired}
          onBusyChange={onBusyChange}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            if (saved) setKlass(saved);
            setEditing(false);
            setNotice('Đã lưu lớp học. Về tổng quan để tải thông tin mới.');
          }}
        />
      ) : null}
      {notice ? (
        <p className="tw-notice" role="status">
          {notice}
        </p>
      ) : null}
      <ResourceView state={resource.state} retry={resource.refresh}>
        {({ students }) => (
          <>
            {students.length ? (
              <AssignmentForm
                classId={klass.classId}
                onAuthor={onAuthor}
                onBusyChange={onBusyChange}
                studentId={students.map((student) => student.studentId)}
                onExpired={onExpired}
                onSaved={() => {
                  setNotice(
                    'Đã giao bài hoặc bài đã có cho toàn bộ học viên đang hiển thị. Mở hồ sơ để xem chi tiết.',
                  );
                  resource.refresh();
                }}
              />
            ) : (
              <p role="status">Lớp chưa có học viên. Thêm học viên bên dưới trước khi giao bài.</p>
            )}
            <section className="tw-panel">
              <h2>Học viên & kết quả</h2>
              <p className="clp-muted">Mở hồ sơ để xem bài đã giao và tiến độ từng học viên.</p>
              <Roster students={students} onOpen={onOpen} />
              <p className="tw-fine">Hiển thị tối đa 200 học viên đã ghi danh.</p>
            </section>
          </>
        )}
      </ResourceView>
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
  onBusyChange,
  onAuthor,
}: {
  onBusyChange: (busy: boolean) => void;
  classId: string;
  studentId: string;
  onAuthor: () => void;
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
              onAuthor={onAuthor}
              onBusyChange={onBusyChange}
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

function AssignmentClassPicker({
  onExpired,
  onAuthor,
  onOpen,
}: {
  onExpired: () => void;
  onAuthor: () => void;
  onOpen: (klass: TeacherClass) => void;
}) {
  const resource = useResource(teacherApi.classes, onExpired);
  return (
    <section>
      <p className="tw-eyebrow">Giao bài cho học viên</p>
      <h1>Giao bài</h1>
      <p>1. Chọn lớp bên dưới → 2. Chọn bài học đã xuất bản → 3. Đặt hạn nộp và giao bài.</p>
      <p className="clp-actions">
        <button className="clp-button clp-button--secondary" onClick={onAuthor}>
          Soạn và xuất bản bài học
        </button>
      </p>
      <ResourceView state={resource.state} retry={resource.refresh}>
        {({ classes }) => (
          <ClassCards classes={classes} onOpen={onOpen} actionLabel="Giao bài cho lớp →" />
        )}
      </ResourceView>
    </section>
  );
}
