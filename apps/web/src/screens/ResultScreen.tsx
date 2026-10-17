/**
 * RESULT screen (CP-05).
 *
 * Shows the server-verdict (correct/incorrect) with the expected value revealed
 * only now, after submission. NEXT asks the server for the following exercise.
 * The verdict is announced politely so a screen reader hears it on arrival.
 */
import { type ResultView } from '../api/client';

export interface ResultScreenProps {
  result: ResultView;
  onNext: () => void;
  onToday: () => void;
  nextBusy: boolean;
  nextError: string | null;
}

export function ResultScreen({ result, onNext, onToday, nextBusy, nextError }: ResultScreenProps) {
  return (
    <section aria-labelledby="result-heading" className="clp-card">
      <h1 id="result-heading">Result</h1>

      <p
        className={`clp-status ${result.correct ? 'clp-status--ok' : 'clp-status--bad'}`}
        role="status"
        aria-live="polite"
      >
        {result.correct ? '✓ Correct' : '✗ Not quite'}
      </p>

      <dl>
        <dt>Your answer</dt>
        <dd lang="zh-Hans">{result.received || '—'}</dd>
        <dt>Expected</dt>
        <dd lang="zh-Hans">{result.expected}</dd>
      </dl>

      <p className="clp-muted">
        {result.next.completedToday} completed today · {result.next.remaining} remaining
      </p>

      {nextError ? (
        <p className="clp-error" role="alert">
          {nextError}
        </p>
      ) : null}

      <div className="clp-actions">
        <button type="button" className="clp-button" onClick={onNext} disabled={nextBusy}>
          {nextBusy ? 'Loading next…' : 'Next exercise'}
        </button>
        <button type="button" className="clp-button clp-button--secondary" onClick={onToday}>
          Back to Today
        </button>
      </div>
    </section>
  );
}
