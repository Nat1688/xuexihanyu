/**
 * EXERCISE screen (CP-05).
 *
 * Renders one server-issued exercise (no answer key in the payload) and submits
 * the learner's answer with a STABLE submission token: the token is generated
 * once per attempt and kept in a ref, so a double click / retry after a network
 * hiccup replays the SAME token and the server treats it idempotently.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, studentApi, type ExerciseView, type ResultView } from '../api/client';

export interface ExerciseScreenProps {
  sessionId: string;
  onResult: (result: ResultView) => void;
  onExpired: () => void;
}

function newSubmissionToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Non-secure contexts (plain http on a LAN) have no randomUUID.
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function ExerciseScreen({ sessionId, onResult, onExpired }: ExerciseScreenProps) {
  const [exercise, setExercise] = useState<ExerciseView | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const tokenRef = useRef<string>(newSubmissionToken());
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const view = await studentApi.exercise(sessionId);
      setExercise(view);
      if (view.alreadyAnswered) {
        // Recovery is an explicit CSRF-protected POST; GET RESULT stays read-only.
        const result = await studentApi.recoverResult(sessionId);
        onResult(result);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 410)) {
        onExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Unable to load this exercise.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, onResult, onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (inFlight.current || !answer.trim()) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await studentApi.answer(sessionId, tokenRef.current, answer);
      onResult(result);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 410)) {
        onExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Unable to submit your answer.');
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  return (
    <section aria-labelledby="exercise-heading" className="clp-card">
      <h1 id="exercise-heading">Exercise</h1>

      {loading ? <p role="status">Loading exercise…</p> : null}

      {error ? (
        <p className="clp-error" role="alert">
          {error}
        </p>
      ) : null}

      {exercise && !exercise.alreadyAnswered ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="clp-muted">
            <span className="clp-badge">{exercise.mode}</span>{' '}
            <span className="clp-badge">{exercise.format.toLowerCase()}</span>
          </p>
          <p className="clp-prompt" lang="zh-Hans">
            {exercise.prompt}
          </p>

          {exercise.format === 'MULTIPLE_CHOICE' && exercise.options ? (
            <fieldset className="clp-options">
              <legend>Choose one answer</legend>
              {exercise.options.map((option) => (
                <label key={option} className="clp-option">
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={answer === option}
                    onChange={() => setAnswer(option)}
                  />
                  <span lang="zh-Hans">{option}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="clp-field">
              <label htmlFor="answer-input">Your answer</label>
              <input
                id="answer-input"
                className="clp-input"
                name="answer"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
              />
            </div>
          )}

          <div className="clp-actions">
            <button type="submit" className="clp-button" disabled={submitting || !answer.trim()}>
              {submitting ? 'Checking…' : 'Submit answer'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
