import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import './LessonReader.css';
import {
  previewApi,
  type InstructionLanguage,
  type LessonPreview,
  type PracticeFeedback,
} from './client';

export function LessonReader({ onBack }: { onBack: () => void }) {
  const [language, setLanguage] = useState<InstructionLanguage>('vi');
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
        if (generation.current === id) setError(message(err, language));
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
      if (generation.current === id) setError(message(err, language));
    } finally {
      if (generation.current === id) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }
  const vi = language === 'vi';
  return (
    <section className="clp-card" aria-labelledby="preview-heading">
      <h1 id="preview-heading">Lesson 01 · PREVIEW</h1>
      <p role="note">
        PREVIEW_ONLY ·{' '}
        {vi
          ? 'Chờ giáo viên chuyên môn duyệt. Tự luyện — chưa lưu tiến độ.'
          : 'Awaiting specialist review. Practice — progress is not saved.'}
      </p>
      <p>
        {vi
          ? 'Reload sẽ xóa trạng thái tự luyện chưa lưu. Nghe/nói cần giáo viên quan sát.'
          : 'Reload resets unsaved practice. Listening/speaking requires teacher observation.'}
      </p>
      <label htmlFor="instruction-language">Instruction language / Ngôn ngữ hướng dẫn</label>{' '}
      <select
        id="instruction-language"
        value={language}
        disabled={busy}
        onChange={(e) => setLanguage(e.target.value as InstructionLanguage)}
      >
        <option value="vi">Tiếng Việt</option>
        <option value="en">English</option>
      </select>
      <button type="button" className="clp-button clp-button--secondary" onClick={onBack}>
        Back to Today
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
            {vi ? 'Tải lại bài' : 'Reload lesson'}
          </button>
        </div>
      ) : null}
      {!lesson && !error ? <p role="status">{vi ? 'Đang tải bài…' : 'Loading lesson…'}</p> : null}
      {lesson ? (
        <article lang={language}>
          <h2>{lesson.title}</h2>
          <p>{lesson.notice}</p>
          <small>Revision: {lesson.revision}</small>
          <ul>
            {lesson.objectives.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h2>{vi ? 'Từ và ngữ cảnh' : 'Words and context'}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>中文</th>
                  <th>Pinyin</th>
                  <th>{vi ? 'Nghĩa' : 'Meaning'}</th>
                </tr>
              </thead>
              <tbody>
                {lesson.concepts.map((c) => (
                  <tr key={c.id}>
                    <td lang="zh-Hans">{c.hanzi}</td>
                    <td lang="zh-Latn-pinyin">{c.pinyin}</td>
                    <td>{c.gloss}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lesson.blocks.map((block) => (
            <section key={block.id}>
              <h2>{block.title}</h2>
              <p>{block.text}</p>
            </section>
          ))}
          <h2>{vi ? 'Hội thoại' : 'Dialogue'}</h2>
          {lesson.dialogue.map((line, i) => (
            <p key={i}>
              {line.speaker}: <span lang="zh-Hans">{line.hanzi}</span>
              <br />
              <span lang="zh-Latn-pinyin">{line.pinyin}</span>
              <br />
              {line.translation}
            </p>
          ))}
          <h2>{vi ? 'Tự luyện — chưa lưu tiến độ' : 'Practice — progress is not saved'}</h2>
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
                  {task.taskId}: {task.prompt}
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
                    <label htmlFor={`practice-${task.taskId}`}>
                      {vi ? 'Câu trả lời' : 'Your answer'}
                    </label>
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
                  {vi ? 'Kiểm tra' : 'Check'} {task.taskId}
                </button>
              </fieldset>
              {feedback[task.taskId] ? <p role="status">{feedback[task.taskId].feedback}</p> : null}
            </form>
          ))}
        </article>
      ) : null}
    </section>
  );
}
function message(error: unknown, language: InstructionLanguage) {
  if (error instanceof ApiError && error.status === 401)
    return language === 'vi'
      ? 'Phiên đăng nhập đã hết hạn. Quay lại và đăng nhập.'
      : 'Session expired. Return and sign in.';
  if (error instanceof ApiError && error.status === 404)
    return language === 'vi'
      ? 'Bản preview hoặc revision không khả dụng. Tải lại bài hoặc quay lại Today.'
      : 'Preview or revision unavailable. Reload the lesson or return to Today.';
  if (error instanceof ApiError && error.status === 403)
    return language === 'vi'
      ? 'Không có quyền hoặc phiên CSRF không hợp lệ.'
      : 'Permission or CSRF check failed.';
  return language === 'vi'
    ? 'Không thể tải hoặc kiểm tra bài. Hãy thử lại.'
    : 'Unable to load or check practice. Please retry.';
}
