import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { admissionsApi, currentApplication } from '../admissions/api';
import { classroomError } from '../api/classrooms';
import { useResource } from '../teacher/useResource';
import { displayNumber } from '../ui-vi';
import { loadFlashcards, publishedLessons } from './api';
import { FlashcardSetupError, type Flashcard } from './model';
import { clozeExample, type PracticeMode } from './typed-recall';
import { TypedFlashcard } from './TypedFlashcard';
import './flashcards.css';

type Direction = 'chinese' | 'meaning';
type Deck = {
  title: string;
  cards: Flashcard[];
  direction: Direction;
  practice: PracticeMode;
  sourceCount: number;
};

export function Flashcards({
  onExpired,
  onOverview,
}: {
  onExpired: () => void;
  onOverview: () => void;
}) {
  const catalog = useResource(admissionsApi.catalog, onExpired);
  const [courseId, setCourseId] = useState('');
  const [deck, setDeck] = useState<Deck | null>(null);
  const data = catalog.state.status === 'ready' ? catalog.state.data : null;
  const approved =
    data?.courses.filter(
      (course) => currentApplication(data.applications, course.publicId)?.status === 'APPROVED',
    ) ?? [];
  return (
    <section className="flashcards" aria-labelledby="flashcard-heading">
      <div className="tw-section-heading">
        <div>
          <p className="ink-eyebrow">Ôn tập theo nhịp của bạn</p>
          <h2 id="flashcard-heading">Flashcard ôn tập</h2>
        </div>
        <button className="clp-button clp-button--secondary" onClick={onOverview}>
          ← Về tổng quan
        </button>
      </div>
      <p className="fc-notice" role="note">
        Đây là lượt tự ôn. Lật thẻ, viết đáp án và tự đánh giá không thay đổi mức độ thành thạo,
        lịch ôn hay trạng thái hoàn thành bài được giao. Kết quả chỉ giữ trong lượt này, không được
        lưu khi rời màn hình hoặc tải lại.
      </p>
      {deck ? (
        <FlashcardRound deck={deck} onChoose={() => setDeck(null)} />
      ) : (
        <>
          {catalog.state.status === 'loading' ? (
            <p role="status">Đang tải khóa học của bạn…</p>
          ) : catalog.state.status === 'error' ? (
            <div role="alert" className="clp-error">
              <p>{classroomError(catalog.state.error)}</p>
              <button className="clp-button" onClick={catalog.refresh}>
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {!approved.length ? (
                <p>
                  Bạn chưa có khóa học đã được duyệt và xuất bản để ôn. Hãy đăng ký khóa học hoặc
                  chờ giáo viên duyệt.
                </p>
              ) : (
                <div className="clp-field">
                  <label htmlFor="fc-course">Khóa học</label>
                  <select
                    id="fc-course"
                    className="clp-input"
                    value={approved.some((row) => row.publicId === courseId) ? courseId : ''}
                    onChange={(event) => setCourseId(event.target.value)}
                  >
                    <option value="">Chọn khóa học đã được duyệt</option>
                    {approved.map((course) => (
                      <option value={course.publicId} key={course.publicId}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {approved.some((row) => row.publicId === courseId) ? (
                <CourseDeck
                  key={courseId}
                  courseId={courseId}
                  courseTitle={approved.find((row) => row.publicId === courseId)!.title}
                  onExpired={onExpired}
                  onDeck={setDeck}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}

function CourseDeck({
  courseId,
  courseTitle,
  onExpired,
  onDeck,
}: {
  courseId: string;
  courseTitle: string;
  onExpired: () => void;
  onDeck: (deck: Deck) => void;
}) {
  const load = useCallback(() => publishedLessons(courseId), [courseId]);
  const resource = useResource(load, onExpired);
  const [lessonId, setLessonId] = useState('');
  const [direction, setDirection] = useState<Direction>('chinese');
  const [practice, setPractice] = useState<PracticeMode>('flip');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function start() {
    if (inFlight.current || resource.state.status !== 'ready' || !lessonId) return;
    const selected = resource.state.data.filter(
      (row) => lessonId === '*' || row.publicId === lessonId,
    );
    if (!selected.length) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const cards = await loadFlashcards(selected, () => active.current);
      if (!cards || !active.current) return;
      if (!cards.length) {
        setError('Chưa có thẻ phù hợp. Bài cần từ vựng hoặc chữ Hán có cả chữ Hán và nghĩa.');
        return;
      }
      const selectedCards =
        practice === 'cloze' ? cards.filter((card) => clozeExample(card) !== null) : cards;
      if (!selectedCards.length) {
        setError(
          'Bài này chưa có ví dụ phù hợp chứa từ đang ôn. Hãy chọn Viết đáp án hoặc Lật thẻ, hoặc nhờ giáo viên bổ sung ví dụ.',
        );
        return;
      }
      onDeck({
        cards: selectedCards,
        sourceCount: cards.length,
        practice,
        direction,
        title: lessonId === '*' ? courseTitle : selected[0].title,
      });
    } catch (err) {
      if (!active.current) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof FlashcardSetupError ? err.message : classroomError(err));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (resource.state.status === 'loading')
    return <p role="status">Đang tải bài học đã xuất bản…</p>;
  if (resource.state.status === 'error')
    return (
      <div role="alert" className="clp-error">
        <p>{classroomError(resource.state.error)}</p>
        <button className="clp-button" onClick={resource.refresh}>
          Tải lại bài học
        </button>
      </div>
    );
  return (
    <div className="fc-setup">
      {!resource.state.data.length ? (
        <p>Khóa học chưa có bài học đã xuất bản để ôn tập.</p>
      ) : (
        <>
          <div className="clp-field">
            <label htmlFor="fc-practice">Cách ôn tập</label>
            <select
              id="fc-practice"
              className="clp-input"
              value={practice}
              disabled={busy}
              onChange={(event) => {
                setPractice(event.target.value as PracticeMode);
                setError('');
              }}
            >
              <option value="flip">Lật thẻ</option>
              <option value="typing">Viết đáp án</option>
              <option value="cloze">Điền từ trong ví dụ</option>
            </select>
          </div>
          <div className="clp-field">
            <label htmlFor="fc-lesson">Bộ thẻ</label>
            <select
              id="fc-lesson"
              className="clp-input"
              disabled={busy}
              value={lessonId}
              onChange={(event) => {
                setLessonId(event.target.value);
                setError('');
              }}
            >
              <option value="">Chọn bài học hoặc toàn khóa</option>
              <option value="*">
                Ôn toàn bộ khóa học ({displayNumber(resource.state.data.length)} bài)
              </option>
              {resource.state.data.map((lesson) => (
                <option key={lesson.publicId} value={lesson.publicId}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </div>
          {practice !== 'cloze' ? (
            <div className="clp-field">
              <label htmlFor="fc-direction">Mặt trước của thẻ</label>
              <select
                id="fc-direction"
                className="clp-input"
                value={direction}
                disabled={busy}
                onChange={(event) => setDirection(event.target.value as Direction)}
              >
                <option value="chinese">Chữ Hán → Nghĩa</option>
                <option value="meaning">Nghĩa → Chữ Hán</option>
              </select>
            </div>
          ) : (
            <p className="clp-muted">
              Điền chữ Hán của từ đang ôn vào ví dụ do giáo viên cung cấp. Chỉ dùng thẻ có ví dụ phù
              hợp; không tự sinh câu.
            </p>
          )}
          <p className="clp-muted">
            Thẻ lấy từ nội dung giáo viên đã xuất bản tại lúc bạn mở bộ thẻ. Chỉ ôn từ vựng và chữ
            Hán; không tự tạo nội dung hoặc đáp án bài kiểm tra.
          </p>
          <button className="clp-button" disabled={busy || !lessonId} onClick={() => void start()}>
            {busy ? 'Đang chuẩn bị bộ thẻ…' : 'Bắt đầu ôn tập'}
          </button>
        </>
      )}
      {error ? (
        <p className="clp-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FlashcardRound({ deck, onChoose }: { deck: Deck; onChoose: () => void }) {
  const [order, setOrder] = useState(deck.cards.map((_, index) => index));
  const [cursor, setCursor] = useState(0),
    [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Record<string, 'remembered' | 'again'>>({});
  const cardButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cardButton.current?.focus({ preventScroll: true });
  }, [cursor, order]);
  const card = deck.cards[order[cursor]];
  const remembered = Object.values(ratings).filter((value) => value === 'remembered').length;
  const again = deck.cards.filter((value) => ratings[value.key] === 'again');
  function rate(value: 'remembered' | 'again') {
    if (!flipped || !card) return;
    setRatings((previous) => ({ ...previous, [card.key]: value }));
    setFlipped(false);
    setCursor((previous) => previous + 1);
  }
  function restart(onlyAgain: boolean) {
    setOrder(
      deck.cards
        .map((_, index) => index)
        .filter((index) => !onlyAgain || ratings[deck.cards[index].key] === 'again'),
    );
    setCursor(0);
    setFlipped(false);
    if (!onlyAgain) setRatings({});
  }
  return (
    <div className="fc-round">
      <div className="tw-section-heading">
        <h3>{deck.title}</h3>
        <button className="clp-button clp-button--secondary" onClick={onChoose}>
          Chọn bộ thẻ khác
        </button>
      </div>
      <p role="status" aria-live="polite">
        {card
          ? `Thẻ ${displayNumber(cursor + 1)} / ${displayNumber(order.length)}`
          : 'Đã xem hết lượt ôn'}
      </p>
      {deck.practice === 'cloze' ? (
        <p className="tw-fine">
          Có {displayNumber(deck.cards.length)} / {displayNumber(deck.sourceCount)} thẻ có ví dụ phù
          hợp. Các thẻ còn lại không được dùng trong chế độ điền từ.
        </p>
      ) : null}
      <progress
        className="fc-progress"
        aria-label="Tiến độ lượt ôn hiện tại"
        max={order.length || 1}
        value={Math.min(cursor, order.length)}
      />
      {card ? (
        <>
          <p className="tw-fine">Bài học: {card.lessons.join(' · ')}</p>
          {deck.practice === 'flip' ? (
            <button
              type="button"
              ref={cardButton}
              className={`fc-card${flipped ? ' is-flipped' : ''}`}
              aria-expanded={flipped}
              onClick={() => setFlipped((value) => !value)}
            >
              <span className="ink-eyebrow">
                {flipped ? 'Mặt sau · Đối chiếu' : 'Mặt trước · Tự nhớ trước khi lật'}
              </span>
              {!flipped ? (
                <strong
                  className={deck.direction === 'chinese' ? 'fc-chinese' : 'fc-meaning'}
                  lang={deck.direction === 'chinese' ? 'zh-Hans' : undefined}
                >
                  {deck.direction === 'chinese' ? card.chinese : card.meaning}
                </strong>
              ) : (
                <>
                  <strong className="fc-chinese" lang="zh-Hans">
                    {card.chinese}
                  </strong>
                  {card.pinyin ? (
                    <span className="fc-pinyin" lang="zh-Latn-pinyin">
                      {card.pinyin}
                    </span>
                  ) : (
                    <span className="tw-fine">Nội dung này chưa có Pinyin.</span>
                  )}
                  <span className="fc-meaning">{card.meaning}</span>
                  {card.example ? <span className="fc-example">{card.example}</span> : null}
                </>
              )}
              <span className="fc-flip-hint">
                {flipped
                  ? 'Nhấn để xem lại mặt trước'
                  : 'Nhấn, dùng Enter hoặc phím cách để lật thẻ'}
              </span>
            </button>
          ) : (
            <TypedFlashcard
              key={card.key}
              card={card}
              direction={deck.direction}
              cloze={deck.practice === 'cloze'}
              onReady={setFlipped}
            />
          )}
          <div className="fc-ratings">
            <button
              className="clp-button clp-button--secondary"
              disabled={!flipped}
              onClick={() => rate('again')}
            >
              Cần ôn lại
            </button>
            <button className="clp-button" disabled={!flipped} onClick={() => rate('remembered')}>
              Đã nhớ
            </button>
          </div>
          <p className="tw-fine">
            {deck.practice === 'flip'
              ? 'Hãy lật thẻ trước khi tự đánh giá.'
              : 'Hãy đối chiếu hoặc xem đáp án mẫu trước khi tự đánh giá.'}{' '}
            Đánh dấu chỉ dùng để chia bộ thẻ trong lượt ôn này.
          </p>
        </>
      ) : (
        <div className="fc-summary">
          <h3>Hoàn tất lượt tự ôn</h3>
          <p>
            Bạn tự đánh dấu đã nhớ {displayNumber(remembered)} / {displayNumber(deck.cards.length)}{' '}
            thẻ; {displayNumber(again.length)} thẻ cần ôn lại.
          </p>
          <div className="clp-actions">
            {again.length ? (
              <button className="clp-button" onClick={() => restart(true)}>
                Ôn lại thẻ chưa nhớ
              </button>
            ) : null}
            <button className="clp-button clp-button--secondary" onClick={() => restart(false)}>
              Ôn lại toàn bộ
            </button>
          </div>
          <p className="clp-muted">
            Đây không phải kết quả chấm bài hay xác nhận thành thạo. Không có tiến độ học tập nào
            được ghi từ lượt tự ôn này.
          </p>
        </div>
      )}
    </div>
  );
}
