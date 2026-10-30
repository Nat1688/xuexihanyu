import { useEffect, useRef, useState } from 'react';
import { PINYIN_STUDIO_HTML } from './pinyin-studio';
import './learning-tools.css';

type Tool = 'pinyin' | 'writing';
export const AN2_HOME_URL = 'https://www.an2.net/vi';
export const AN2_WORKSHEET_URL = 'https://www.an2.net/vi/tools/worksheet/tianzige';

/** Standalone tools: no app identifiers, credentials, curriculum or progress passed. */
export function LearningTools({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<Tool | null>(null);
  const [loaded, setLoaded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  function choose(tool: Tool | null) {
    setLoaded(false);
    setSelected(tool);
  }
  return (
    <section className="learning-tools" aria-labelledby="learning-tools-heading">
      <div className="tw-section-heading">
        <div>
          <p className="tw-eyebrow">Luyện thêm mỗi ngày</p>
          <h1 id="learning-tools-heading" tabIndex={-1} ref={heading}>
            Công cụ học tập
          </h1>
          <p className="clp-muted">
            Nghe Pinyin và tạo giấy luyện viết ngay bên cạnh bài học của bạn.
          </p>
        </div>
        <button type="button" className="clp-button clp-button--secondary" onClick={onClose}>
          ← Quay lại học tập
        </button>
      </div>
      {selected === null ? (
        <div className="learning-tools-grid">
          <article className="clp-card">
            <span className="learning-tool-symbol" lang="zh-Hans" aria-hidden="true">
              拼
            </span>
            <h2>Luyện phát âm Pinyin</h2>
            <p>
              Bảng âm tiết, thanh mẫu, vận mẫu và bốn thanh điệu. Chọn âm, nghe mẫu và luyện đọc
              theo.
            </p>
            <button type="button" className="clp-button" onClick={() => choose('pinyin')}>
              Mở Pinyin Studio
            </button>
          </article>
          <article className="clp-card">
            <span className="learning-tool-symbol" lang="zh-Hans" aria-hidden="true">
              字
            </span>
            <h2>Tạo giấy tập viết</h2>
            <p>
              Nhập chữ Hán, chọn ô luyện viết, Pinyin hoặc thứ tự nét rồi tạo phiếu để in cho học
              viên.
            </p>
            <button type="button" className="clp-button" onClick={() => choose('writing')}>
              Mở công cụ tạo giấy tập viết
            </button>
          </article>
        </div>
      ) : (
        <>
          <nav className="clp-actions learning-tools-tabs" aria-label="Chọn công cụ học tập">
            <button
              type="button"
              className="clp-button clp-button--secondary"
              onClick={() => choose(null)}
            >
              Tất cả công cụ
            </button>
            <button
              type="button"
              className="clp-button clp-button--secondary"
              aria-pressed={selected === 'pinyin'}
              onClick={() => {
                if (selected !== 'pinyin') choose('pinyin');
              }}
            >
              Phát âm Pinyin
            </button>
            <button
              type="button"
              className="clp-button clp-button--secondary"
              aria-pressed={selected === 'writing'}
              onClick={() => {
                if (selected !== 'writing') choose('writing');
              }}
            >
              Giấy tập viết
            </button>
          </nav>
          {selected === 'pinyin' ? (
            <p className="clp-muted">
              Chạm vào một âm tiết, sau đó chọn thanh 1–4 để nghe. Âm thanh sử dụng nguồn bên ngoài
              và giọng đọc dự phòng của thiết bị theo Pinyin Studio.
            </p>
          ) : (
            <div className="learning-tools-notice">
              <p>
                Công cụ của an2.net. Nội dung bạn nhập được xử lý trên trang đó; XueXiHanyu không tự
                gửi bài học hoặc thông tin học viên.
              </p>
              <p>
                Nếu khung không hiển thị, không tạo hoặc không in được phiếu, hãy{' '}
                <a href={AN2_WORKSHEET_URL} target="_blank" rel="noopener noreferrer">
                  mở công cụ ở tab riêng
                </a>
                .{' '}
                <a href={AN2_HOME_URL} target="_blank" rel="noopener noreferrer">
                  Xem tất cả công cụ an2.net
                </a>
                .
              </p>
            </div>
          )}
          {!loaded ? (
            <p role="status">
              Đang mở {selected === 'pinyin' ? 'Pinyin Studio' : 'công cụ tạo giấy tập viết'}…
            </p>
          ) : null}
          {selected === 'pinyin' ? (
            <iframe
              key="pinyin"
              className="learning-tool-frame"
              title="Pinyin Studio — Luyện phát âm Pinyin"
              srcDoc={PINYIN_STUDIO_HTML}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              allow="autoplay"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
          ) : (
            <iframe
              key="writing"
              className="learning-tool-frame"
              title="an2.net — Tạo giấy tập viết tiếng Trung"
              src={AN2_WORKSHEET_URL}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
          )}
        </>
      )}
    </section>
  );
}
