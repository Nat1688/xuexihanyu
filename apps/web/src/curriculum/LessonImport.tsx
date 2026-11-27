import { useState } from 'react';
import type { LessonDocument } from './api';
import {
  applyLessonImport,
  exportLessonJson,
  IMPORT_MAX_BYTES,
  CSV_FIELD_GUIDE,
  LESSON_KIND_LABELS,
  parseLessonFile,
  type ImportedLesson,
} from './lesson-import';

export function LessonImport({
  document,
  onApply,
}: {
  document: LessonDocument;
  onApply: (next: LessonDocument) => void;
}) {
  const [incoming, setIncoming] = useState<ImportedLesson | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [filename, setFilename] = useState('');
  async function read(file: File) {
    setIncoming(null);
    setError('');
    setFilename(file.name);
    setReading(true);
    try {
      if (file.size > IMPORT_MAX_BYTES) throw Error('File tối đa 64 KiB.');
      setIncoming(parseLessonFile(file.name, await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được file.');
    } finally {
      setReading(false);
    }
  }
  function download() {
    let source: string;
    try {
      source = exportLessonJson(document);
      setError('');
    } catch (err) {
      setError(
        `Chưa thể tạo file nhập lại. Hãy hoàn thiện nội dung: ${err instanceof Error ? err.message : 'Dữ liệu không hợp lệ.'}`,
      );
      return;
    }
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json;charset=utf-8' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'bai-hoc.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="tw-panel lesson-import">
      <summary>Nhập bài học từ file JSON / CSV</summary>
      <p>
        Soạn bằng Excel: tải mẫu CSV tiếng Việt bên dưới. Mỗi dòng là một từ vựng, điểm ngữ pháp
        hoặc câu ví dụ; một file là một bài học. Tối đa 100 mục, 64 KiB.
      </p>
      <div className="clp-actions">
        <a href="/templates/bai-hoc-mau.json" download>
          Tải mẫu JSON
        </a>
        <a href="/templates/bai-hoc-mau.csv?v=vi-2" download="bai-hoc-mau-tieng-viet.csv">
          Tải mẫu CSV tiếng Việt (mở bằng Excel)
        </a>
        <button type="button" className="clp-button clp-button--secondary" onClick={download}>
          Tải bài hợp lệ (.json)
        </button>
      </div>
      <section aria-label="Hướng dẫn điền mẫu CSV" className="lesson-import-guide">
        <h3>Điền mẫu Excel như thế nào?</h3>
        <ol>
          <li>
            Mở mẫu CSV mới tải. Giữ nguyên dòng tên cột; thay hai dòng ví dụ bằng nội dung của bạn.
            Muốn thêm nội dung, viết tiếp ở các dòng bên dưới.
          </li>
          <li>
            Tên và giới thiệu bài học chỉ cần điền ở dòng nội dung đầu tiên. Với bài chỉ có chữ, để
            trống hai cột tài nguyên cuối.
          </li>
          <li>
            Trong Excel, chọn{' '}
            <strong>Lưu thành (Save As) → CSV UTF-8 (Comma delimited) (*.csv)</strong>. Nếu được
            hỏi, giữ định dạng CSV. Không chọn CSV ANSI hoặc đổi đuôi file Excel thành .csv.
          </li>
          <li>
            Chọn file bên dưới → xem trước → áp dụng → <strong>Lưu bản nháp</strong>. Chọn “Thay thế
            nội dung bài” để dùng tên và giới thiệu trong file.
          </li>
        </ol>
        <p>
          Mẫu đã được sửa mã hóa để hiển thị đúng tiếng Việt, chữ Hán và Pinyin trong Excel. Hãy tải
          lại mẫu mới; thay font trong file cũ không khôi phục được chữ đã lưu sai mã hóa.
        </p>
        <details>
          <summary>Giải thích từng cột và ví dụ cần điền</summary>
          <dl className="lesson-import-fields">
            {CSV_FIELD_GUIDE.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  {field.description}
                  <br />
                  <span>Ví dụ: {field.example}</span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <p>
          Mẫu CSV tiếng Anh cũ và JSON vẫn dùng được. Không hỗ trợ file Excel .xlsx hoặc HTML; hãy
          lưu bản CSV UTF-8 để nhập.
        </p>
      </section>
      <label className="clp-field">
        Chọn file bài học
        <input
          type="file"
          accept=".json,.csv"
          disabled={reading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void read(file);
          }}
        />
      </label>
      {reading ? <p role="status">Đang đọc file…</p> : null}
      {error ? (
        <p role="alert" className="clp-error">
          {error}
        </p>
      ) : null}
      {incoming ? (
        <section aria-label="Xem trước file nhập" style={{ overflowWrap: 'anywhere' }}>
          <h3>
            {filename} · {incoming.items.length} mục
          </h3>
          <p>{incoming.title || 'Giữ tiêu đề hiện tại'}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{incoming.description}</p>
          <ol>
            {incoming.items.map((item, index) => (
              <li key={index} style={{ whiteSpace: 'pre-wrap' }}>
                <strong>
                  {LESSON_KIND_LABELS[item.kind] || item.kind}: {item.simplified || item.meaning}
                </strong>
                <p>
                  {item.pinyin} · {item.meaning}
                </p>
                <p>{String(item.reference?.example || '')}</p>
                {item.reference?.url ? (
                  <p>
                    {item.reference.type === 'audio' ? 'Âm thanh' : 'Hình ảnh'}:{' '}
                    {String(item.reference.url)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <label className="clp-field">
            Cách nhập
            <select
              aria-label="Cách nhập"
              className="clp-input"
              value={mode}
              onChange={(event) => setMode(event.target.value as 'append' | 'replace')}
            >
              <option value="append">Thêm vào cuối bài</option>
              <option value="replace">Thay thế nội dung bài</option>
            </select>
          </label>
          {mode === 'replace' ? (
            <p>
              Toàn bộ các mục trong trình soạn bài sẽ được thay bằng nội dung file. Bạn có thể tải
              nội dung đang soạn trước khi áp dụng.
            </p>
          ) : (
            <p>
              Giữ tiêu đề, giải thích và các mục hiện tại; thêm các mục trong file vào cuối bài.
            </p>
          )}
          <button
            type="button"
            className="clp-button clp-button--secondary"
            onClick={() => {
              try {
                onApply(applyLessonImport(document, incoming, mode));
                setIncoming(null);
                setError('');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Không thể nhập bài học.');
              }
            }}
          >
            Áp dụng vào trình soạn bài
          </button>
          <button
            type="button"
            onClick={() => {
              setIncoming(null);
              setError('');
            }}
          >
            Hủy nhập
          </button>
        </section>
      ) : null}
      <p>
        Sau khi áp dụng, kiểm tra bài học rồi bấm “Lưu bản nháp”. Chỉ khi thấy “Đã lưu bản nháp trên
        hệ thống.” mới là lưu thành công. Giữ file gốc để nhập lại nếu phiên đăng nhập hết hạn.
      </p>
    </details>
  );
}
