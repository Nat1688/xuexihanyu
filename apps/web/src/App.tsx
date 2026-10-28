/**
 * CLP SPA root (CP-00 skeleton + CP-05 student MVP).
 *
 * Student path:
 *   LOGIN → TODAY → CONTINUE → EXERCISE → RESULT → NEXT
 *
 * TW-01 adds an API-backed Teacher workspace. Role hints select navigation,
 * never permissions. On reload `/auth/me` restores the cookie session; only
 * the Student exercise identifier may be retained, never Teacher data/tokens.
 * All privileged calls are independently authorised server-side.
 */
import { useCallback, useEffect, useState } from 'react';

import { ApiError, studentApi, type Principal, type ResultView } from './api/client';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { forgetExercise, recalledExercise, rememberExercise } from './exercise-resume';
import { LoginScreen } from './screens/LoginScreen';
import { ResultScreen } from './screens/ResultScreen';
import { TodayScreen } from './screens/TodayScreen';
import { TeacherWorkspace } from './teacher/TeacherWorkspace';
import { canStudy, canTeach } from './teacher/model';
import { LessonReader } from './lesson-preview/LessonReader';
import { PreviewEntry } from './lesson-preview/PreviewEntry';

type Step =
  | { view: 'boot' }
  | { view: 'login' }
  | { view: 'today' }
  | { view: 'lesson-preview' }
  | { view: 'teacher' }
  | { view: 'unauthorized' }
  | { view: 'exercise'; sessionId: string }
  | { view: 'result'; result: ResultView };

export function App() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [step, setStep] = useState<Step>({ view: 'boot' });
  const [nextBusy, setNextBusy] = useState(false);
  const [teacherBusy, setTeacherBusy] = useState(false);
  useEffect(() => {
    if (!teacherBusy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [teacherBusy]);
  const [nextError, setNextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await studentApi.me();
        if (cancelled) return;
        setPrincipal(me);
        const resumable = me && canStudy(me) ? recalledExercise(sessionStorage) : null;
        setStep(
          me && resumable
            ? { view: 'exercise', sessionId: resumable }
            : {
                view: me
                  ? canTeach(me)
                    ? 'teacher'
                    : canStudy(me)
                      ? 'today'
                      : 'unauthorized'
                  : 'login',
              },
        );
      } catch {
        if (!cancelled) setStep({ view: 'login' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toLogin = useCallback(() => {
    forgetExercise(sessionStorage);
    setPrincipal(null);
    setTeacherBusy(false);
    setNextError(null);
    setStep({ view: 'login' });
  }, []);

  const requestNext = useCallback(async () => {
    setNextBusy(true);
    setNextError(null);
    try {
      const exercise = await studentApi.next();
      rememberExercise(sessionStorage, exercise.sessionId);
      setStep({ view: 'exercise', sessionId: exercise.sessionId });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toLogin();
        return;
      }
      if (err instanceof ApiError && err.code === 'NO_CONTENT') {
        // Nothing published/due: the empty state lives on TODAY.
        setStep({ view: 'today' });
        return;
      }
      setNextError(err instanceof ApiError ? err.message : 'Unable to start the next exercise.');
    } finally {
      setNextBusy(false);
    }
  }, [toLogin]);

  const onResult = useCallback((result: ResultView) => {
    if (result.integrityStatus === 'COMPLETE') forgetExercise(sessionStorage);
    setNextError(null);
    setStep({ view: 'result', result });
  }, []);

  return (
    <>
      <a className="clp-skip-link" href="#clp-main">
        Skip to main content
      </a>
      <div className={step.view === 'teacher' ? 'clp-shell tw-shell' : 'clp-shell'}>
        <header>
          <p className="clp-muted" style={{ margin: 0 }}>
            CLP — Chinese Learning Platform
          </p>
          {principal && canTeach(principal) && canStudy(principal) ? (
            <nav className="clp-actions" aria-label="Workspace switcher">
              <button
                className="clp-button clp-button--secondary"
                aria-pressed={step.view === 'teacher'}
                disabled={teacherBusy}
                onClick={() => setStep({ view: 'teacher' })}
              >
                Teacher
              </button>
              <button
                className="clp-button clp-button--secondary"
                aria-pressed={step.view !== 'teacher'}
                disabled={teacherBusy}
                onClick={() => {
                  const resumable = recalledExercise(sessionStorage);
                  setStep(
                    resumable ? { view: 'exercise', sessionId: resumable } : { view: 'today' },
                  );
                }}
              >
                Student
              </button>
            </nav>
          ) : null}
        </header>
        <main id="clp-main" tabIndex={-1}>
          {step.view === 'boot' ? <p role="status">Loading…</p> : null}

          {step.view === 'login' ? (
            <LoginScreen
              onAuthenticated={(p) => {
                setPrincipal(p);
                setStep({ view: canTeach(p) ? 'teacher' : canStudy(p) ? 'today' : 'unauthorized' });
              }}
            />
          ) : null}

          {step.view === 'teacher' && principal ? (
            <TeacherWorkspace
              key={principal.publicId}
              principal={principal}
              onExpired={toLogin}
              onBusyChange={setTeacherBusy}
            />
          ) : null}
          {step.view === 'unauthorized' ? (
            <p role="alert">
              No Student or Teacher workspace is available for this account. Contact your
              administrator.
            </p>
          ) : null}

          {step.view === 'today' && principal ? (
            <>
              <PreviewEntry onOpen={() => setStep({ view: 'lesson-preview' })} />
              <TodayScreen
                principal={principal}
                onContinue={() => void requestNext()}
                onLoggedOut={toLogin}
              />
            </>
          ) : null}
          {step.view === 'lesson-preview' && principal && canStudy(principal) ? (
            <LessonReader onBack={() => setStep({ view: 'today' })} />
          ) : null}

          {step.view === 'exercise' ? (
            <ExerciseScreen
              sessionId={step.sessionId}
              onResult={onResult}
              onExpired={() => {
                forgetExercise(sessionStorage);
                setStep({ view: 'today' });
              }}
            />
          ) : null}

          {step.view === 'result' ? (
            <ResultScreen
              result={step.result}
              onNext={() => void requestNext()}
              onToday={() => setStep({ view: 'today' })}
              nextBusy={nextBusy}
              nextError={nextError}
            />
          ) : null}
        </main>
      </div>
    </>
  );
}
