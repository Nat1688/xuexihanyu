# XueXiHanyu — Nền tảng dạy và học tiếng Trung

NestJS REST API + React/Vite + PostgreSQL, kiến trúc modular monolith.
Giao diện mặc định tiếng Việt (`vi-VN`); hiển thị thời gian theo `Asia/Ho_Chi_Minh`, lưu UTC.

Source hiện tại gồm CORE-01, TOOLS-01 và ENROLL-01 trên nhánh `codex/core-product-completion`, đã triển khai lên Mac mini Local Trial ngày 30/10/2026. Schema có 11 migrations. Owner đã cho phép commit/push để bàn giao sang homelab; chưa merge vào `main`. Kiểm thử bằng tài khoản thật trên Local Trial vẫn chờ Owner nghiệm thu.

Giáo viên có thể tạo/chỉnh sửa khóa học và lớp, soạn bài học gồm chữ Hán/Pinyin/nghĩa tiếng Việt/ví dụ, thêm/xóa/sắp xếp nội dung, lưu nháp, xem trước, xuất bản, ghi danh theo CL-01 và giao bài. Dashboard lấy số liệu thực; hồ sơ học viên hiển thị kết quả và trạng thái hoàn thành.

Học viên có thể tham gia lớp, mở bài được giao, đọc nội dung, tiếp tục vị trí đọc sau reload, luyện tập và xem lại kết quả. Bài học hoàn thành khi mỗi mục luyện tập hiện tại đã được trả lời đúng ít nhất một lần, theo quy tắc Owner duyệt ngày 30/10/2026. Lịch sử học là dữ liệu append-oriented; mastery giữ nguyên quy tắc hiện có.

- [Lấy source và tiếp tục phát triển trên homelab](docs/Operations/HOMELAB-HANDOFF.md)
- [Bàn giao ENROLL-01: đăng ký và duyệt khóa học](docs/Review/ENROLL-01-HANDOFF.md)
- [Bàn giao TOOLS-01: Pinyin Studio và giấy tập viết AN2](docs/Review/TOOLS-01-HANDOFF.md)
- [Bàn giao, kết quả kiểm thử và hướng dẫn demo CORE-01](docs/Review/CORE-01-HANDOFF.md)
- [Phạm vi CORE-01](docs/Planning/CORE-01-TASK-CONTRACT.md)
- [Quy tắc repository](AGENTS.md)
- [Kiến trúc và ADR](docs/Architecture/BASELINE.md)
- [CL-01](deploy/cl01/CONTRACT.md)

Học sinh tự đăng ký với quyền STUDENT và đăng nhập ngay; gửi yêu cầu tham gia khóa đã xuất bản, chờ Admin hoặc giáo viên phụ trách duyệt và xếp lớp. Quy tắc duyệt áp dụng cả học sinh cũ. Công cụ học tập gồm Pinyin Studio và trang tạo giấy luyện viết AN2; không tự gửi dữ liệu học viên sang công cụ bên ngoài.

## Phụ thuộc và lệnh phát triển

Node.js >=20, npm workspaces, PostgreSQL. Cài dependency bằng `npm ci`, sinh Prisma client bằng `npm run db:generate`.

| Lệnh | Mục đích |
|---|---|
| `npm run dev -w @clp/web` | Chạy Vite SPA |
| `npm run start:dev -w @clp/api` | Chạy API với cấu hình local do developer cung cấp |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run lint` | Kiểm tra ESLint |
| `npm run build` | Build API và SPA |
| `npm test` | Unit và API tests không cần PostgreSQL |
| `npm run test:integration` | Bộ PostgreSQL cần các target cô lập được cấu hình tường minh |
| `npm run format:check` | Kiểm tra định dạng toàn repository; xem các lỗi baseline trong bàn giao |

Không chạy migration/seed/reset trên Local Trial hoặc database đang phục vụ người dùng. Không lấy cấu hình của Mac mini để chạy thử workspace này. Demo CORE-01 tạo PostgreSQL riêng và tự dừng; hướng dẫn nằm trong tài liệu bàn giao.

## Giới hạn hiện tại

Câu hỏi luyện tập sử dụng bộ sinh/chấm CP-02/CP-05 từ nội dung có sẵn; chưa có ngân hàng câu hỏi tùy ý. Hình/âm thanh dùng URL HTTPS; chưa có upload/storage. Giao theo danh sách lớp dùng assignment hiện có, tối đa 200 học viên đang hiển thị, không có transaction chung cho cả lớp; lỗi một phần được thông báo. Bản nháp mới của một bài đã xuất bản tạm ngừng khả năng truy cập bài đó đến khi xuất bản lại.

Các tài liệu checkpoint CP-00 đến CP-06 giữ vai trò hồ sơ lịch sử và hợp đồng module; README này mô tả trạng thái source hiện tại.
