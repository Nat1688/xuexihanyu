import { displayNumber } from '../ui-vi';
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
      <h1 id="result-heading">Kết quả</h1>

      <p
        className={`clp-status ${result.correct ? 'clp-status--ok' : 'clp-status--bad'}`}
        role="status"
        aria-live="polite"
      >
        {result.correct ? '✓ Chính xác' : '✗ Chưa chính xác'}
      </p>

      <dl>
        <dt>Câu trả lời của bạn</dt>
        <dd lang="zh-Hans">{result.received || '—'}</dd>
        <dt>Đáp án đúng</dt>
        <dd lang="zh-Hans">{result.expected}</dd>
      </dl>

      <p className="clp-muted">
        {displayNumber(result.next.completedToday)} đã hoàn thành hôm nay ·{' '}
        {displayNumber(result.next.remaining)} còn lại
      </p>

      {nextError ? (
        <p className="clp-error" role="alert">
          {nextError}
        </p>
      ) : null}

      <div className="clp-actions">
        <button type="button" className="clp-button" onClick={onNext} disabled={nextBusy}>
          {nextBusy ? 'Đang tải bài tiếp theo…' : 'Bài tập tiếp theo'}
        </button>
        <button type="button" className="clp-button clp-button--secondary" onClick={onToday}>
          Về Hôm nay
        </button>
      </div>
    </section>
  );
}
