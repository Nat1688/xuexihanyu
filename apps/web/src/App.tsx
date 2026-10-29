/**
 * CLP SPA root (CP-00 skeleton + CP-05 student MVP).
 *
 * Student path:
 *   LOGIN → TODAY → CONTINUE → EXERCISE → RESULT → NEXT
 *
 * TW-01 adds an API-backed Không gian giáo viên. Role hints select navigation,
 * never permissions. On reload `/auth/me` restores the cookie session; only
 * the Student exercise identifier may be retained, never Teacher data/tokens.
 * All privileged calls are independently authorised server-side.
 */
import { studentError, ui } from './ui-vi';
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
import { StudentWorkspace } from './classrooms/StudentWorkspace';

type Step =
  | { view: 'boot' }
  | { view: 'login' }
  | { view: 'today' }
  | { view: 'student' }
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
                      ? 'student'
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
      setNextError(studentError(err, 'Không thể mở bài tập tiếp theo. Vui lòng thử lại.'));
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
        {ui.app.skip}
      </a>
      <div className={step.view === 'teacher' ? 'clp-shell tw-shell' : 'clp-shell'}>
        <header>
          <p className="clp-muted" style={{ margin: 0 }}>
            {ui.app.title}
          </p>
          {principal && canTeach(principal) && canStudy(principal) ? (
            <nav className="clp-actions" aria-label="Chuyển không gian học tập">
              <button
                className="clp-button clp-button--secondary"
                aria-pressed={step.view === 'teacher'}
                disabled={teacherBusy}
                onClick={() => setStep({ view: 'teacher' })}
              >
                Giáo viên
              </button>
              <button
                className="clp-button clp-button--secondary"
                aria-pressed={step.view !== 'teacher'}
                disabled={teacherBusy}
                onClick={() => {
                  const resumable = recalledExercise(sessionStorage);
                  setStep(
                    resumable ? { view: 'exercise', sessionId: resumable } : { view: 'student' },
                  );
                }}
              >
                Học viên
              </button>
            </nav>
          ) : null}
        </header>
        <main id="clp-main" tabIndex={-1}>
          {step.view === 'boot' ? <p role="status">{ui.common.loading}</p> : null}

          {step.view === 'login' ? (
            <LoginScreen
              onAuthenticated={(p) => {
                setPrincipal(p);
                setStep({
                  view: canTeach(p) ? 'teacher' : canStudy(p) ? 'student' : 'unauthorized',
                });
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
              Tài khoản này chưa có quyền truy cập giao diện học viên hoặc giáo viên. Vui lòng liên
              hệ quản trị viên.
            </p>
          ) : null}

          {step.view === 'today' && principal ? (
            <>
              <button
                className="clp-button clp-button--secondary"
                onClick={() => setStep({ view: 'student' })}
              >
                Về không gian học viên
              </button>
              <p>Tự học độc lập — không phải danh sách bài được giao theo lớp.</p>
              <PreviewEntry onOpen={() => setStep({ view: 'lesson-preview' })} />
              <TodayScreen
                principal={principal}
                onContinue={() => void requestNext()}
                onLoggedOut={toLogin}
              />
            </>
          ) : null}
          {step.view === 'student' && principal && canStudy(principal) ? (
            <StudentWorkspace
              onExpired={toLogin}
              onSelfStudy={() => setStep({ view: 'today' })}
              onExercise={(exercise) => {
                rememberExercise(sessionStorage, exercise.sessionId);
                setStep({ view: 'exercise', sessionId: exercise.sessionId });
              }}
            />
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
            <>
              <button
                className="clp-button clp-button--secondary"
                onClick={() => setStep({ view: 'student' })}
              >
                Về bài được giao và lớp học
              </button>
              <p>
                Nút bài tiếp theo sử dụng hàng đợi tự học, không xác nhận hoàn thành bài được giao.
              </p>
              <ResultScreen
                result={step.result}
                onNext={() => void requestNext()}
                onToday={() => setStep({ view: 'today' })}
                nextBusy={nextBusy}
                nextError={nextError}
              />
            </>
          ) : null}
        </main>
      </div>
    </>
  );
}
