import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';
import { classroomApi, classroomError } from '../api/classrooms';
import { displayDate } from '../teacher/model';
import { useResource } from '../teacher/useResource';

export function ClassEnrollmentPanel({
  classId,
  onExpired,
  onEnrolled,
  onBusyChange,
}: {
  classId: string;
  onExpired: () => void;
  onEnrolled: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const load = useCallback(() => classroomApi.invitation(classId), [classId]);
  const resource = useResource(load, onExpired);
  const [code, setCode] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function mutate(action: 'rotate' | 'revoke' | 'enroll') {
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setNotice('');
    if (action !== 'enroll') setCode(null);
    try {
      if (action === 'rotate') {
        const result = await classroomApi.rotate(classId);
        setCode(result.code);
        setNotice('Mã mới có hiệu lực trong 24 giờ. Mã cũ không còn sử dụng được.');
      } else if (action === 'revoke') {
        await classroomApi.revoke(classId);
        setNotice('Đã thu hồi mã. Các học viên đã tham gia vẫn ở trong lớp.');
      } else {
        await classroomApi.enroll(classId, login);
        setLogin('');
        setNotice('Đã thêm học viên vào lớp.');
        onEnrolled();
      }
      resource.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(classroomError(err));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="tw-panel" aria-label="Mời học viên">
      <h2>Mời học viên vào lớp</h2>
      <p>Chỉ chia sẻ mã với học viên bạn muốn mời. Mã được hiển thị một lần sau khi tạo.</p>
      {resource.state.status === 'loading' ? <p role="status">Đang tải trạng thái mã…</p> : null}
      {resource.state.status === 'error' ? (
        <p role="alert">
          {classroomError(resource.state.error)} <button onClick={resource.refresh}>Thử lại</button>
        </p>
      ) : null}
      {resource.state.status === 'ready' ? (
        <p>
          Trạng thái:{' '}
          {
            {
              NONE: 'Chưa có mã',
              ACTIVE: 'Đang có hiệu lực',
              EXPIRED: 'Đã hết hạn',
              REVOKED: 'Đã thu hồi',
            }[resource.state.data.state]
          }
          {resource.state.data.expiresAt
            ? ` · Hết hạn: ${displayDate(resource.state.data.expiresAt)}`
            : ''}
        </p>
      ) : null}
      <fieldset className="tw-fieldset" disabled={busy} aria-busy={busy} style={{ minWidth: 0 }}>
        <div className="clp-actions">
          <button className="clp-button" onClick={() => void mutate('rotate')}>
            Tạo mã mới / thay mã cũ
          </button>
          <button
            className="clp-button clp-button--secondary"
            onClick={() => void mutate('revoke')}
          >
            Thu hồi mã
          </button>
        </div>
        {code ? (
          <p>
            Mã tham gia: <output style={{ overflowWrap: 'anywhere' }}>{code}</output>
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate('enroll');
          }}
        >
          <label>
            Thêm tài khoản học viên có sẵn
            <input
              className="clp-input"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
              maxLength={320}
              autoComplete="off"
            />
          </label>
          <p>Nhập chính xác tên đăng nhập. Tài khoản phải đang hoạt động và có quyền học viên.</p>
          <button className="clp-button" type="submit">
            Thêm học viên
          </button>
        </form>
      </fieldset>
      {busy ? <p role="status">Đang xử lý, vui lòng chờ…</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
