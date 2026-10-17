/**
 * TODAY screen (CP-05).
 *
 * Read-only summary of the learner's own queue: completed today, remaining and
 * the due/unseen entries the server derived for THIS authenticated learner.
 * The CONTINUE button asks the server for the next exercise — the client never
 * picks which item is presented.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, studentApi, type Principal, type TodayView } from '../api/client';

export interface TodayScreenProps {
  principal: Principal;
  onContinue: () => void;
  onLoggedOut: () => void;
}

export function TodayScreen({ principal, onContinue, onLoggedOut }: TodayScreenProps) {
  const [today, setToday] = useState<TodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setToday(await studentApi.today());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Unable to load today.');
    } finally {
      setLoading(false);
    }
  }, [onLoggedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onContinueClick() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      onContinue();
    } finally {
      busy.current = false;
    }
  }

  async function onLogout() {
    try {
      await studentApi.logout();
    } catch {
      // Logout is best-effort from the client: cookies are cleared server-side
      // and the app returns to the login screen regardless.
    }
    onLoggedOut();
  }

  return (
    <section aria-labelledby="today-heading" className="clp-card">
      <h1 id="today-heading">Today</h1>
      <p className="clp-muted">
        Signed in as <strong>{principal.displayName ?? principal.login}</strong>.{' '}
        <button type="button" className="clp-button clp-button--secondary" onClick={onLogout}>
          Sign out
        </button>
      </p>

      {loading ? <p role="status">Loading your plan…</p> : null}

      {error ? (
        <p className="clp-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="clp-button clp-button--secondary"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      ) : null}

      {today ? (
        <>
          <p>
            <span className="clp-badge">Daily goal {today.dailyGoal}</span>{' '}
            <span className="clp-badge">{today.completedToday} completed today</span>{' '}
            <span className="clp-badge">{today.remaining} queued</span>
          </p>

          {today.empty ? (
            <div>
              <h2>Nothing to practise right now</h2>
              <p className="clp-muted">
                There is no published or due material for you yet. Check back after your teacher
                publishes a lesson.
              </p>
            </div>
          ) : (
            <ul className="clp-list" aria-label="Today’s queue">
              {today.entries.map((entry) => (
                <li key={entry.itemId}>
                  <strong>{entry.lessonTitle}</strong>{' '}
                  {entry.due ? (
                    <span className="clp-badge clp-badge--due">due</span>
                  ) : entry.state ? (
                    <span className="clp-badge">{entry.state.toLowerCase()}</span>
                  ) : (
                    <span className="clp-badge">new</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="clp-actions">
            <button
              type="button"
              className="clp-button"
              onClick={() => void onContinueClick()}
              disabled={today.empty}
            >
              Continue
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
