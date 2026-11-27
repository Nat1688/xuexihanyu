import { useEffect, useRef, useState } from 'react';
import { displayNumber } from '../ui-vi';
import {
  categoryPath,
  dictionaryClient,
  type DictionaryCategory,
  type PublicationPreview,
} from './client';

export function PublicationPanel({
  categories,
  busy,
  setBusy,
  onChanged,
  onError,
}: {
  categories: DictionaryCategory[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  onChanged: () => void;
  onError: (error: unknown) => void;
}) {
  const [group, setGroup] = useState(''),
    [plan, setPlan] = useState<PublicationPreview | null>(null);
  const [reference, setReference] = useState(''),
    [reviewed, setReviewed] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState('');
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch (e) {
      if (alive.current) {
        setPlan(null);
        setConfirmed(false);
        setReviewed(false);
        setNotice(
          'Chưa xác nhận được kết quả. Hãy xem trước lại nhóm để kiểm tra trạng thái trước khi thử lại.',
        );
        onError(e);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function preview() {
    const data = await dictionaryClient.publicationPreview(group);
    if (alive.current) {
      setPlan(data);
      setConfirmed(false);
      setReviewed(false);
    }
  }
  async function publish(action: 'PUBLISH' | 'UNPUBLISH') {
    if (
      !plan ||
      !confirmed ||
      (action === 'PUBLISH' && (!reviewed || reference.trim().length < 20 || plan.blockers.length))
    )
      return;
    const result = await dictionaryClient.publication(group, {
      fingerprint: plan.fingerprint,
      action,
      confirmed: true,
      contentReviewed: reviewed,
      reviewReference: reference,
    });
    if (alive.current) {
      setPlan(null);
      setConfirmed(false);
      setReviewed(false);
      setNotice(
        `${action === 'PUBLISH' ? 'Đã xuất bản' : 'Đã gỡ xuất bản'} ${displayNumber(result.changed)} trong ${displayNumber(result.total)} mục từ của nhóm. Không xóa dữ liệu hoặc lịch sử.`,
      );
      onChanged();
    }
  }
  async function rights(
    source: PublicationPreview['sources'][number],
    value: 'CONFIRMED' | 'UNKNOWN',
  ) {
    await dictionaryClient.sourceRights(source.publicId, {
      expectedRevision: source.revision,
      rights: value,
      evidence: proofs[source.publicId],
      confirmed: true,
    });
    await preview();
    onChanged();
    if (alive.current)
      setNotice(
        value === 'CONFIRMED'
          ? 'Đã lưu căn cứ quyền nguồn. Hãy kiểm tra lại phạm vi trước khi xuất bản.'
          : 'Đã thu hồi xác nhận nguồn. Các mục liên quan không còn được phục vụ cho người học.',
      );
  }
  return (
    <details className="dict-import dict-publication">
      <summary>Xuất bản theo nhóm chuyên ngành</summary>
      <p>
        Chọn nhóm để đưa nội dung đã rà soát vào Từ điển và Tiếng Trung chuyên ngành của học viên,
        giảng viên và quản trị viên.
      </p>
      <fieldset disabled={busy}>
        <label>
          Nhóm chuyên ngành cần xuất bản
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setPlan(null);
              setReference('');
              setReviewed(false);
              setConfirmed(false);
              setNotice('');
            }}
          >
            <option value="">Chọn một nhóm chuyên ngành</option>
            {categories.map((c) => (
              <option value={c.publicId} key={c.publicId}>
                {categoryPath(c, categories)} ({displayNumber(c.count)} mục)
              </option>
            ))}
          </select>
        </label>
        <button
          className="clp-button clp-button--secondary"
          disabled={!group}
          onClick={() => void run(preview)}
        >
          Xem trước phạm vi xuất bản
        </button>
        {plan && (
          <section aria-label="Phạm vi xuất bản">
            <h2>{plan.category.label}</h2>
            <p>
              {displayNumber(plan.total)} mục từ, gồm các nhóm con. Đã xuất bản:{' '}
              {displayNumber(plan.published)}. Chưa hiệu đính: {displayNumber(plan.unverified)}.
            </p>
            <p className="tw-notice">
              Có {displayNumber(plan.sharedEntries)} mục thuộc nhiều nhóm. Xuất bản hoặc gỡ xuất bản
              sẽ áp dụng cho toàn bộ mục từ ở mọi nhóm liên quan.
            </p>
            {!!plan.blockers.length && (
              <div role="status">
                <h3>Chưa đủ điều kiện xuất bản</h3>
                <ul>
                  {plan.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            <h3>Quyền sử dụng các nguồn liên quan</h3>
            <p>
              Chỉ xác nhận khi bạn có căn cứ hợp lệ. Nhập dữ liệu không có nghĩa là đã có quyền tái
              xuất bản. Xác nhận nguồn áp dụng cho mọi mục từ sử dụng nguồn đó.
            </p>
            {plan.sources.map((source) => (
              <details key={source.publicId} className="dict-source-review">
                <summary>
                  {source.label} —{' '}
                  {source.rights === 'CONFIRMED'
                    ? 'Đã xác nhận quyền'
                    : source.rights === 'DENIED'
                      ? 'Không được phép'
                      : 'Chưa xác nhận quyền'}
                </summary>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  Xem nguồn tham khảo
                </a>
                {source.evidence && <p>Căn cứ đã lưu: {source.evidence}</p>}
                <label>
                  Căn cứ quyền sử dụng hoặc lý do thu hồi (20–2.000 ký tự)
                  <textarea
                    value={proofs[source.publicId] || ''}
                    maxLength={2000}
                    onChange={(e) =>
                      setProofs((p) => ({ ...p, [source.publicId]: e.target.value }))
                    }
                  />
                </label>
                <p>
                  Không nhập mật khẩu, token hoặc thông tin riêng tư. Hệ thống ghi người thực hiện
                  và thời điểm xác nhận.
                </p>
                <button
                  className="clp-button clp-button--secondary"
                  disabled={(proofs[source.publicId] || '').trim().length < 20}
                  onClick={() => void run(() => rights(source, 'CONFIRMED'))}
                >
                  Xác nhận quyền sử dụng nguồn
                </button>
                {source.rights === 'CONFIRMED' && (
                  <button
                    className="clp-button clp-button--secondary"
                    disabled={(proofs[source.publicId] || '').trim().length < 20}
                    onClick={() => void run(() => rights(source, 'UNKNOWN'))}
                  >
                    Thu hồi xác nhận quyền nguồn
                  </button>
                )}
              </details>
            ))}
            <label>
              Ghi chú hoặc tài liệu rà soát nội dung toàn nhóm (20–2.000 ký tự)
              <textarea
                maxLength={2000}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="dict-confirm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{' '}
              Tôi đã rà soát toàn bộ nội dung nhóm và xác nhận đủ điều kiện phục vụ người học.
            </label>
            <label className="dict-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              Tôi xác nhận phạm vi cả nhóm con và ảnh hưởng đến các mục từ dùng chung.
            </label>
            <div className="clp-actions">
              <button
                className="clp-button"
                disabled={
                  !confirmed ||
                  !reviewed ||
                  reference.trim().length < 20 ||
                  !!plan.blockers.length ||
                  !plan.total
                }
                onClick={() => void run(() => publish('PUBLISH'))}
              >
                Xuất bản toàn bộ nhóm
              </button>
              <button
                className="clp-button clp-button--secondary"
                disabled={!confirmed || !plan.published}
                onClick={() => void run(() => publish('UNPUBLISH'))}
              >
                Gỡ xuất bản toàn bộ nhóm
              </button>
            </div>
          </section>
        )}
      </fieldset>
      {busy && <p role="status">Đang xử lý. Vui lòng giữ trang mở và không gửi lại thao tác.</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
