import { useCallback, useState } from 'react';
import { ApiError, studentApi, type Principal } from '../api/client';
import { teacherApi, type TeacherClass, type RosterStudent } from '../api/teacher';
import { canTeach, teacherError } from './model';
import { useResource } from './useResource';
import { ClassCards, ResourceView, Roster, StudentRecord } from './TeacherViews';
import { AssignmentForm, CreateClassForm } from './TeacherForms';
import './teacher.css';

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
    return <p role="alert">Teacher access is not available for this account.</p>;
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
            XueXiHanyu<small>TEACHER WORKSPACE</small>
          </div>
        </div>
        <nav aria-label="Teacher navigation">
          <button
            className={page.view === 'dashboard' ? 'tw-nav active' : 'tw-nav'}
            onClick={() => setPage({ view: 'dashboard' })}
          >
            Overview <span aria-hidden="true">↗</span>
          </button>
          <p className="tw-fine">Your classes. Their next steps.</p>
        </nav>
        <div className="tw-profile">
          <strong>{principal.displayName || principal.login}</strong>
          <small>Teacher workspace</small>
          <button
            className="clp-button clp-button--secondary"
            onClick={() => void logout()}
            disabled={logoutBusy}
          >
            {logoutBusy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <div className="tw-content">
        {logoutError ? (
          <p role="alert" className="clp-error">
            {logoutError} You have not been signed out.
          </p>
        ) : null}
        {page.view !== 'dashboard' ? (
          <nav className="tw-breadcrumb" aria-label="Breadcrumb">
            <button onClick={() => setPage({ view: 'dashboard' })}>All classes</button>
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
          <p className="tw-eyebrow">A little progress, every day</p>
          <h1>Your teaching space</h1>
          <p className="clp-muted">Stay close to your classes and each learner’s journey.</p>
        </div>
        <button className="clp-button" onClick={() => setCreating((value) => !value)}>
          {creating ? 'Close form' : '+ New class'}
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
            setNotice('Class created.');
            resource.refresh();
          }}
        />
      ) : null}
      <ResourceView state={resource.state} retry={resource.refresh}>
        {({ classes }) => (
          <>
            <div className="tw-stats">
              <div>
                <span>Classes shown</span>
                <strong>{classes.length}</strong>
              </div>
              <div>
                <span>Enrollments in shown classes</span>
                <strong>{classes.reduce((sum, klass) => sum + klass.enrolled, 0)}</strong>
              </div>
              <div className="tw-stat-note">
                <span>One learner at a time</span>
                <p>Open a class to review assignments and evidence-backed progress.</p>
              </div>
            </div>
            <div className="tw-section-heading">
              <h2>My classes</h2>
              <button className="clp-button clp-button--secondary" onClick={resource.refresh}>
                Refresh classes
              </button>
            </div>
            <ClassCards classes={classes} onOpen={onOpen} />
            <p className="tw-fine">
              Up to 50 owned classes. Enrollment counts are not unique learner totals.
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
}: {
  klass: TeacherClass;
  onExpired: () => void;
  onOpen: (student: RosterStudent) => void;
}) {
  const load = useCallback(() => teacherApi.roster(klass.classId), [klass.classId]);
  const resource = useResource(load, onExpired);
  return (
    <>
      <p className="tw-eyebrow">Classroom · {klass.term || 'No term set'}</p>
      <div className="tw-section-heading">
        <h1>{klass.title}</h1>
        <button className="clp-button clp-button--secondary" onClick={resource.refresh}>
          Refresh roster
        </button>
      </div>
      <section className="tw-panel">
        <h2>Students</h2>
        <p className="clp-muted">
          Open a learner’s record to review progress or assign a published lesson.
        </p>
        <ResourceView state={resource.state} retry={resource.refresh}>
          {({ students }) => <Roster students={students} onOpen={onOpen} />}
        </ResourceView>
        <p className="tw-fine">
          Up to 200 enrolled students. Records are authorized by the server.
        </p>
      </section>
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
          Refresh record
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
                setNotice('Lesson assigned.');
                resource.refresh();
              }}
            />
          </>
        )}
      </ResourceView>
    </>
  );
}
