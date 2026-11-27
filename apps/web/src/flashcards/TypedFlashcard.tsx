import { useEffect, useRef, useState } from 'react';
import type { Flashcard } from './model';
import { clozeExample, matchesSample } from './typed-recall';

export function TypedFlashcard({
  card,
  direction,
  cloze,
  onReady,
}: {
  card: Flashcard;
  direction: 'chinese' | 'meaning';
  cloze: boolean;
  onReady: (ready: boolean) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const imeEnter = useRef(false);
  const kind = cloze || direction === 'meaning' ? 'chinese' : 'meaning';
  const sample = kind === 'chinese' ? card.chinese : card.meaning;
  const prompt = cloze ? clozeExample(card) : direction === 'chinese' ? card.chinese : card.meaning;
  const matches = matchesSample(answer, sample, kind);
  useEffect(() => {
    if (!checked) input.current?.focus({ preventScroll: true });
  }, [checked]);
  function reveal(skipped: boolean) {
    if (checked || composing.current || imeEnter.current || (!skipped && !answer.trim())) return;
    setRevealed(skipped);
    setChecked(true);
    onReady(true);
  }
  return (
    <div className="fc-typed">
      <div className="fc-typed-prompt">
        <p className="ink-eyebrow">
          {cloze
            ? 'Điền từ đang ôn vào chỗ trống'
            : kind === 'meaning'
              ? 'Nhìn chữ Hán · Viết nghĩa'
              : 'Nhìn nghĩa · Viết chữ Hán'}
        </p>
        <p
          className={cloze || kind === 'meaning' ? 'fc-chinese' : 'fc-meaning'}
          lang={cloze || kind === 'meaning' ? 'zh-Hans' : undefined}
        >
          {prompt}
        </p>
        {cloze ? <p className="fc-cloze-hint">Gợi ý nghĩa: {card.meaning}</p> : null}
      </div>
      <form
        className="fc-typed-form"
        onSubmit={(event) => {
          event.preventDefault();
          reveal(false);
        }}
      >
        <label htmlFor="fc-typed-answer">
          {kind === 'chinese' ? 'Viết chữ Hán của bạn' : 'Viết nghĩa theo cách bạn nhớ'}
        </label>
        <input
          id="fc-typed-answer"
          ref={input}
          className="clp-input"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (composing.current ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229)
            ) {
              // Let the IME commit normally, but do not treat its Enter as form submission.
              imeEnter.current = true;
              setTimeout(() => {
                imeEnter.current = false;
              }, 0);
            }
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={2000}
          disabled={checked}
        />
        <div className="clp-actions">
          <button type="submit" className="clp-button" disabled={checked || !answer.trim()}>
            Đối chiếu
          </button>
          <button
            type="button"
            className="clp-button clp-button--secondary"
            disabled={checked}
            onClick={() => reveal(true)}
          >
            Xem đáp án mẫu
          </button>
          {checked ? (
            <button
              type="button"
              className="clp-button clp-button--secondary"
              onClick={() => {
                setChecked(false);
                setRevealed(false);
                setAnswer('');
                onReady(false);
              }}
            >
              Thử viết lại
            </button>
          ) : null}
        </div>
      </form>
      {checked ? (
        <section className="fc-typed-feedback" aria-label="Đáp án mẫu" aria-live="polite">
          <p role="status" className={matches && !revealed ? 'clp-status--ok' : undefined}>
            {revealed
              ? 'Đáp án mẫu để bạn tự đối chiếu.'
              : matches
                ? 'Khớp với đáp án mẫu.'
                : kind === 'meaning'
                  ? 'Chưa trùng cách diễn đạt mẫu. Nghĩa có thể có cách diễn đạt khác; hãy tự đối chiếu.'
                  : 'Khác cách viết mẫu. Hãy đối chiếu chữ Hán bên dưới.'}
          </p>
          <strong className="fc-chinese" lang="zh-Hans">
            {card.chinese}
          </strong>
          {card.pinyin ? (
            <p className="fc-pinyin" lang="zh-Latn-pinyin">
              {card.pinyin}
            </p>
          ) : null}
          <p className="fc-meaning">{card.meaning}</p>
          {card.example ? <p className="fc-example">{card.example}</p> : null}
          <p className="tw-fine">
            Đây là đối chiếu trong lượt tự ôn, không phải chấm điểm. Chọn Đã nhớ hoặc Cần ôn lại để
            tiếp tục.
          </p>
        </section>
      ) : null}
    </div>
  );
}
