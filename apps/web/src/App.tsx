/**
 * CLP SPA root (CP-00 skeleton + CP-05 student MVP).
 *
 * One authenticated path only:
 *   LOGIN → TODAY → CONTINUE → EXERCISE → RESULT → NEXT
 *
 * State is held in memory (no tokens in web storage). On mount the SPA asks
 * `/auth/me` whether a cookie session already exists, so a reload lands on
 * TODAY rather than forcing a re-login. Every privileged call is authorised
 * server-side (role guard) — this component never decides access.
 */
import { useCallback, useEffect, useState } from 'react';

import { ApiError, studentApi, type Principal, type ResultView } from './api/client';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ResultScreen } from './screens/ResultScreen';
import { TodayScreen } from './screens/TodayScreen';

type Step =
  | { view: 'boot' }
  | { view: 'login' }
  | { view: 'today' }
  | { view: 'exercise'; sessionId: string }
  | { view: 'result'; result: ResultView };

export function App() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [step, setStep] = useState<Step>({ view: 'boot' });
  const [nextBusy, setNextBusy] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await studentApi.me();
        if (cancelled) return;
        setPrincipal(me);
        setStep({ view: me ? 'today' : 'login' });
      } catch {
        if (!cancelled) setStep({ view: 'login' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toLogin = useCallback(() => {
    setPrincipal(null);
    setNextError(null);
    setStep({ view: 'login' });
  }, []);

  const requestNext = useCallback(async () => {
    setNextBusy(true);
    setNextError(null);
    try {
      const exercise = await studentApi.next();
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
    setNextError(null);
    setStep({ view: 'result', result });
  }, []);

  return (
    <>
      <a className="clp-skip-link" href="#clp-main">
        Skip to main content
      </a>
      <div className="clp-shell">
        <header>
          <p className="clp-muted" style={{ margin: 0 }}>
            CLP — Chinese Learning Platform
          </p>
        </header>
        <main id="clp-main" tabIndex={-1}>
          {step.view === 'boot' ? <p role="status">Loading…</p> : null}

          {step.view === 'login' ? (
            <LoginScreen
              onAuthenticated={(p) => {
                setPrincipal(p);
                setStep({ view: 'today' });
              }}
            />
          ) : null}

          {step.view === 'today' && principal ? (
            <TodayScreen
              principal={principal}
              onContinue={() => void requestNext()}
              onLoggedOut={toLogin}
            />
          ) : null}

          {step.view === 'exercise' ? (
            <ExerciseScreen
              sessionId={step.sessionId}
              onResult={onResult}
              onExpired={() => setStep({ view: 'today' })}
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
