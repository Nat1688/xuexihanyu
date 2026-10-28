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
        Loading your workspace…
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="clp-error" role="alert">
        <p>{teacherError(state.error)}</p>
        <button className="clp-button clp-button--secondary" onClick={retry}>
          Retry
        </button>
      </div>
    );
  return <>{children(state.data)}</>;
}

export function ClassCards({
  classes,
  onOpen,
}: {
  classes: TeacherClass[];
  onOpen: (value: TeacherClass) => void;
}) {
  if (!classes.length)
    return (
      <div className="tw-empty">
        <h2>A fresh start for your classroom</h2>
        <p>Create a class to begin. Only classes you own appear here.</p>
      </div>
    );
  return (
    <div className="tw-class-grid">
      {classes.map((klass, index) => (
        <button className="tw-class-card" key={klass.classId} onClick={() => onOpen(klass)}>
          <span className="tw-class-mark" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="tw-tag">{klass.term || 'No term set'}</span>
          <span className="tw-class-title">{klass.title}</span>
          <span className="clp-muted">
            {klass.enrolled} enrolled · View class <span aria-hidden="true">↗</span>
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
        <h3>No students enrolled yet</h3>
        <p>
          Enrollment currently requires an existing account’s public identifier through the Teacher
          API. Account search is not available.
        </p>
      </div>
    );
  return (
    <div className="tw-table-wrap">
      <table className="tw-table">
        <caption className="tw-sr-only">Class roster</caption>
        <thead>
          <tr>
            <th>Student</th>
            <th>Enrolled</th>
            <th>Learning record</th>
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
                  View progress
                  <span className="tw-sr-only"> for {student.displayName || student.login}</span>
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
          <p className="tw-eyebrow">Learning record</p>
          <h1>{detail.displayName || detail.login}</h1>
        </div>
        <span className="tw-tag">Last {evidence.window.days} days</span>
      </div>
      <p className="clp-muted">
        Evidence from lessons assigned in this class. Informational only — not a grade.
      </p>
      <div className="tw-stats">
        <div>
          <span>Attempts</span>
          <strong>{evidence.attempts}</strong>
        </div>
        <div>
          <span>Correct answers</span>
          <strong>{evidence.correct}</strong>
        </div>
        <div>
          <span>Accuracy</span>
          <strong>
            {evidence.accuracy === null ? '—' : `${Math.round(evidence.accuracy * 100)}%`}
          </strong>
        </div>
        <div>
          <span>Assigned lessons</span>
          <strong>{evidence.assignedLessons}</strong>
        </div>
      </div>
      {!evidence.totalEvents ? (
        <p className="tw-notice">
          No learning evidence in this window. This does not mean the student has failed or
          completed the assignments.
        </p>
      ) : null}
      <p className="tw-fine">
        Window: {displayDate(evidence.window.from)} – {displayDate(evidence.window.to)} (end
        exclusive). Dates use your browser’s local timezone.
      </p>
      <section className="tw-panel">
        <h2>Assigned lessons</h2>
        {!detail.assignments.length ? (
          <p className="clp-muted">No lessons assigned yet.</p>
        ) : (
          <ul className="tw-rows">
            {detail.assignments.map((assignment) => (
              <li key={assignment.assignmentId}>
                <strong>{assignment.lessonTitle}</strong>
                <span>{displayDate(assignment.dueAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="tw-fine">
          Due dates are shown as scheduled. The API does not provide assignment completion status.
        </p>
      </section>
      <div className="tw-columns">
        <section className="tw-panel">
          <h2>Practice signals</h2>
          <p className="tw-fine">
            Up to 10 items returned by the API. Item labels and mastery rule/version are
            unavailable; no rule version is inferred.
          </p>
          {!detail.progress.weakItems.length ? (
            <p className="clp-muted">No practice signals available.</p>
          ) : (
            <ul className="tw-rows">
              {detail.progress.weakItems.map((item, index) => (
                <li key={item.itemId}>
                  <div>
                    <strong>Item {index + 1}</strong>
                    <small>
                      {item.correct} correct · {item.incorrect} incorrect in window
                    </small>
                  </div>
                  <span className="tw-tag">{item.state.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tw-panel">
          <h2>Recent activity</h2>
          <p className="tw-fine">Up to 20 events in this evidence window.</p>
          {!detail.recentEvidence.length ? (
            <p className="clp-muted">No recent activity.</p>
          ) : (
            <ul className="tw-rows">
              {detail.recentEvidence.map((event) => (
                <li key={event.eventId}>
                  <div>
                    <strong>
                      {detail.assignments.find(
                        (assignment) => assignment.lessonId === event.lessonId,
                      )?.lessonTitle || 'Assigned lesson activity'}
                    </strong>
                    <small>{displayDate(event.occurredAt)}</small>
                  </div>
                  <span className="tw-tag">
                    {event.accepted === null
                      ? 'Activity'
                      : event.accepted
                        ? 'Correct'
                        : 'Incorrect'}
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
