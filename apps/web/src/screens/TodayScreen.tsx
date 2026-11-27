/**
 * TODAY screen (CP-05).
 *
 * Read-only summary of the learner's own queue: đã hoàn thành hôm nay, remaining and
 * the due/unseen entries the server derived for THIS authenticated learner.
 * The CONTINUE button asks the server for the next exercise — the client never
 * picks which item is presented.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { learningState, studentError, displayNumber } from '../ui-vi';
import { ApiError, studentApi, type Principal, type TodayView } from '../api/client';

export interface TodayScreenProps {
  principal: Principal;
  onContinue: () => void;
  onLoggedOut: () => void;
}

export function TodayScreen({ principal, onContinue, onLoggedOut }: TodayScreenProps) {
  const [today, setToday] = useState<TodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setToday(await studentApi.today());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return;
      }
      setError(studentError(err, 'Không thể tải kế hoạch hôm nay. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [onLoggedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onContinueClick() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      onContinue();
    } finally {
      busy.current = false;
    }
  }

  async function onLogout() {
    try {
      await studentApi.logout();
    } catch {
      // Logout is best-effort from the client: cookies are cleared server-side
      // and the app returns to the login screen regardless.
    }
    onLoggedOut();
  }

  return (
    <section aria-labelledby="today-heading" className="clp-card">
      <h1 id="today-heading">Hôm nay</h1>
      <p className="clp-muted">
        Đang đăng nhập với tài khoản <strong>{principal.displayName ?? principal.login}</strong>.{' '}
        <button type="button" className="clp-button clp-button--secondary" onClick={onLogout}>
          Đăng xuất
        </button>
      </p>

      {loading ? <p role="status">Đang tải kế hoạch học…</p> : null}

      {error ? (
        <p className="clp-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="clp-button clp-button--secondary"
            onClick={() => void load()}
          >
            Thử lại
          </button>
        </p>
      ) : null}

      {today ? (
        <>
          <p>
            <span className="clp-badge">Mục tiêu mỗi ngày {displayNumber(today.dailyGoal)}</span>{' '}
            <span className="clp-badge">
              {displayNumber(today.completedToday)} đã hoàn thành hôm nay
            </span>{' '}
            <span className="clp-badge">{displayNumber(today.remaining)} bài trong hàng đợi</span>
          </p>

          {today.empty ? (
            <div>
              <h2>Hiện chưa có bài để luyện tập</h2>
              <p className="clp-muted">
                Bạn chưa có nội dung đã xuất bản hoặc đến hạn ôn tập. Hãy quay lại sau khi giáo viên
                xuất bản bài học.
              </p>
            </div>
          ) : (
            <ul className="clp-list" aria-label="Hàng đợi hôm nay">
              {today.entries.map((entry) => (
                <li key={entry.itemId}>
                  <strong>{entry.lessonTitle}</strong>{' '}
                  {entry.due ? (
                    <span className="clp-badge clp-badge--due">đến hạn</span>
                  ) : entry.state ? (
                    <span className="clp-badge">{learningState(entry.state)}</span>
                  ) : (
                    <span className="clp-badge">mới</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="clp-actions">
            <button
              type="button"
              className="clp-button"
              onClick={() => void onContinueClick()}
              disabled={today.empty}
            >
              Tiếp tục
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
