import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { UI_LANGUAGE, ui } from '../ui-vi';
import './LessonReader.css';
import {
  previewApi,
  type InstructionLanguage,
  type LessonPreview,
  type PracticeFeedback,
} from './client';

export function LessonReader({ onBack }: { onBack: () => void }) {
  const [language, setLanguage] = useState<InstructionLanguage>(UI_LANGUAGE);
  const [lesson, setLesson] = useState<LessonPreview | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, PracticeFeedback>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pinned = useRef<{ packageId: string; revision: string } | null>(null);
  useEffect(() => {
    const id = ++generation.current;
    setLesson(null);
    setAnswers({});
    setFeedback({});
    setError(null);
    setBusy(false);
    inFlight.current = false;
    void previewApi
      .read(language, pinned.current?.revision)
      .then((value) => {
        if (generation.current === id) {
          if (
            pinned.current &&
            (pinned.current.packageId !== value.packageId ||
              pinned.current.revision !== value.revision)
          )
            throw new ApiError(404, 'LESSON_PREVIEW_UNAVAILABLE', 'Lesson preview unavailable.');
          pinned.current = { packageId: value.packageId, revision: value.revision };
          setLesson(value);
        }
      })
      .catch((err) => {
        if (generation.current === id) setError(message(err));
      });
    return () => {
      generation.current = id + 1;
    };
  }, [language, reload]);
  async function check(taskId: string) {
    if (!lesson || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const id = generation.current;
    try {
      const result = await previewApi.check({
        instructionLanguage: lesson.instructionLanguage,
        revision: lesson.revision,
        taskId,
        answer: answers[taskId] ?? '',
      });
      if (
        generation.current === id &&
        result.revision === lesson.revision &&
        result.instructionLanguage === language
      )
        setFeedback((previous) => ({ ...previous, [taskId]: result }));
    } catch (err) {
      if (generation.current === id) setError(message(err));
    } finally {
      if (generation.current === id) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }
  return (
    <section className="clp-card" aria-labelledby="preview-heading">
      <h1 id="preview-heading">{ui.preview.title}</h1>
      <p role="note" data-publication-status="PREVIEW_ONLY">
        {ui.preview.notice}
      </p>
      <p>{ui.preview.reload}</p>
      <label htmlFor="instruction-language">{ui.preview.language}</label>{' '}
      <select
        id="instruction-language"
        value={language}
        disabled={busy}
        onChange={(e) => setLanguage(e.target.value as InstructionLanguage)}
      >
        <option value="vi">{ui.preview.vi}</option>
        <option value="en">{ui.preview.en}</option>
      </select>
      <button type="button" className="clp-button clp-button--secondary" onClick={onBack}>
        {ui.preview.back}
      </button>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              pinned.current = null;
              setReload((x) => x + 1);
            }}
            disabled={busy}
          >
            Tải lại bài
          </button>
        </div>
      ) : null}
      {!lesson && !error ? <p role="status">Đang tải bài…</p> : null}
      {lesson ? (
        <article lang={UI_LANGUAGE}>
          <h2 lang={language}>{lesson.title}</h2>
          <p lang={language}>{lesson.notice}</p>
          <small>
            {ui.preview.revision}: {lesson.revision}
          </small>
          <ul>
            {lesson.objectives.map((x) => (
              <li key={x} lang={language}>
                {x}
              </li>
            ))}
          </ul>
          <h2>Từ và ngữ cảnh</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>中文</th>
                  <th>Pinyin</th>
                  <th>Nghĩa</th>
                </tr>
              </thead>
              <tbody>
                {lesson.concepts.map((c) => (
                  <tr key={c.id}>
                    <td lang="zh-Hans">{c.hanzi}</td>
                    <td lang="zh-Latn-pinyin">{c.pinyin}</td>
                    <td lang={language}>{c.gloss}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lesson.blocks.map((block) => (
            <section key={block.id} lang={language}>
              <h2>{block.title}</h2>
              <p>{block.text}</p>
            </section>
          ))}
          <h2>Hội thoại</h2>
          {lesson.dialogue.map((line, i) => (
            <p key={i}>
              {line.speaker}: <span lang="zh-Hans">{line.hanzi}</span>
              <br />
              <span lang="zh-Latn-pinyin">{line.pinyin}</span>
              <br />
              <span lang={language}>{line.translation}</span>
            </p>
          ))}
          <h2>Tự luyện — chưa lưu tiến độ</h2>
          {lesson.practices.map((task) => (
            <form
              key={task.taskId}
              onSubmit={(e) => {
                e.preventDefault();
                void check(task.taskId);
              }}
            >
              <fieldset disabled={busy}>
                <legend>
                  {task.taskId}: <span lang={language}>{task.prompt}</span>
                </legend>
                {task.options ? (
                  task.options.map((option) => (
                    <label key={option} style={{ display: 'block', padding: 8 }}>
                      <input
                        type="radio"
                        name={task.taskId}
                        value={option}
                        checked={answers[task.taskId] === option}
                        onChange={() => {
                          setAnswers((x) => ({ ...x, [task.taskId]: option }));
                          setFeedback((x) => {
                            const y = { ...x };
                            delete y[task.taskId];
                            return y;
                          });
                        }}
                      />
                      <span lang="zh-Hans">{option}</span>
                    </label>
                  ))
                ) : (
                  <>
                    <label htmlFor={`practice-${task.taskId}`}>Câu trả lời</label>
                    <input
                      id={`practice-${task.taskId}`}
                      value={answers[task.taskId] ?? ''}
                      autoComplete="off"
                      maxLength={200}
                      onChange={(e) => {
                        setAnswers((x) => ({ ...x, [task.taskId]: e.target.value }));
                        setFeedback((x) => {
                          const y = { ...x };
                          delete y[task.taskId];
                          return y;
                        });
                      }}
                    />
                  </>
                )}
                <button type="submit" disabled={!answers[task.taskId]?.trim()}>
                  Kiểm tra {task.taskId}
                </button>
              </fieldset>
              {feedback[task.taskId] ? (
                <p role="status" lang={language}>
                  {feedback[task.taskId].feedback}
                </p>
              ) : null}
            </form>
          ))}
        </article>
      ) : null}
    </section>
  );
}
function message(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Hãy quay lại và đăng nhập.';
  if (error instanceof ApiError && error.status === 404) return ui.preview.unavailable;
  if (error instanceof ApiError && error.status === 403)
    return 'Bạn không có quyền truy cập hoặc kiểm tra bảo mật không thành công.';
  return 'Không thể tải hoặc kiểm tra bài. Vui lòng thử lại.';
}
