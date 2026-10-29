/**
 * EXERCISE screen (CP-05).
 *
 * Renders one server-issued exercise (no answer key in the payload) and submits
 * the learner's answer with a STABLE submission token: the token is generated
 * once per attempt and kept in a ref, so a double click / retry after a network
 * hiccup replays the SAME token and the server treats it idempotently.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { exerciseMode, studentError } from '../ui-vi';
import { ApiError, studentApi, type ExerciseView, type ResultView } from '../api/client';
import { loadRememberedExercise, submitRememberedExercise } from '../exercise-resume';

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
      const loaded = await loadRememberedExercise(studentApi, sessionStorage, sessionId);
      setExercise(loaded.exercise);
      if (loaded.result) {
        const result = loaded.result;
        onResult(result);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 410)) {
        onExpired();
        return;
      }
      setError(studentError(err, 'Không thể tải bài tập. Vui lòng thử lại.'));
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
      const result = await submitRememberedExercise(
        studentApi,
        sessionStorage,
        sessionId,
        tokenRef.current,
        answer,
      );
      onResult(result);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 410)) {
        onExpired();
        return;
      }
      setError(
        studentError(
          err,
          'Chưa xác nhận được kết quả nộp bài. Hãy thử lại hoặc tải lại để khôi phục.',
        ),
      );
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  return (
    <section aria-labelledby="exercise-heading" className="clp-card">
      <h1 id="exercise-heading">Bài tập</h1>

      {loading ? <p role="status">Đang tải bài tập…</p> : null}

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
            <span className="clp-badge">{exerciseMode(exercise.mode)}</span>{' '}
            <span className="clp-badge">
              {exercise.format === 'MULTIPLE_CHOICE' ? 'Trắc nghiệm' : 'Nhập đáp án'}
            </span>
          </p>
          <p
            className="clp-prompt"
            lang={
              exercise.mode === 'VI_TO_ZH'
                ? 'vi'
                : exercise.mode === 'PINYIN_TO_ZH'
                  ? 'zh-Latn-pinyin'
                  : 'zh-Hans'
            }
          >
            {exercise.prompt}
          </p>

          {exercise.format === 'MULTIPLE_CHOICE' && exercise.options ? (
            <fieldset className="clp-options">
              <legend>Chọn một đáp án</legend>
              {exercise.options.map((option) => (
                <label key={option} className="clp-option">
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={answer === option}
                    onChange={() => setAnswer(option)}
                  />
                  <span
                    lang={
                      exercise.mode === 'ZH_TO_VI'
                        ? 'vi'
                        : exercise.mode === 'ZH_TO_PINYIN'
                          ? 'zh-Latn-pinyin'
                          : 'zh-Hans'
                    }
                  >
                    {option}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="clp-field">
              <label htmlFor="answer-input">Câu trả lời của bạn</label>
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
              {submitting ? 'Đang kiểm tra…' : 'Nộp đáp án'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
