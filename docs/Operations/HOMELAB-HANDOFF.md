# Bàn giao source sang homelab — 30/10/2026

Repository: https://github.com/Nat1688/xuexihanyu
Branch bàn giao: `codex/core-product-completion`. Bao gồm CORE-01 (soạn/xuất bản/giao/học bài), TOOLS-01 (Pinyin/AN2), ENROLL-01 (đăng ký, xin tham gia khóa, duyệt và xếp lớp). Owner cho phép commit/push trong yêu cầu bàn giao này; các ghi chú “không commit/push” ở hồ sơ task trước phản ánh phạm vi tại thời điểm thực hiện.

## Lấy source

```sh
git clone --branch codex/core-product-completion https://github.com/Nat1688/xuexihanyu.git
cd xuexihanyu
git status
```

Dùng Node.js 22/npm và PostgreSQL 17 để khớp runtime đã kiểm thử. Cài bằng `npm ci`, tạo cấu hình riêng từ `.env.example` và sinh Prisma client bằng `npm run db:generate`. Dùng tài khoản/database phát triển riêng trên homelab; runtime secrets do Owner cấp riêng. Không có `.env`, khóa SSH, mật khẩu runtime, database dump/backup, node_modules/dist hoặc evidence cục bộ trong commit. Git chỉ chuyển source; dữ liệu học viên không được chuyển bằng Git.

Lệnh kiểm tra thông thường: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Bộ integration cần URL/confirmation của các database test cô lập; không báo PASS khi bị skip do thiếu môi trường. Harness `apps/web/test/core-realstack.cjs` và `learning-tools-browser.cjs` hiện dùng đường dẫn PostgreSQL/Playwright trên Windows; cần điều chỉnh đường dẫn trước khi chạy chúng ở homelab Linux. Đây không phải script triển khai Linux hoàn chỉnh.

## Schema và quyền học

Có 11 migrations; migration mới: `20261030073000_enroll01_course_admissions`. Không sửa migrations đã áp dụng, không dùng reset để chuyển máy. Với database homelab đang có dữ liệu, kiểm tra migration history/target và tạo, xác minh backup trước khi áp dụng migration còn thiếu. Nếu chuyển cả dữ liệu, cần quy trình backup/restore riêng được Owner duyệt.

Tài khoản mới chỉ nhận STUDENT. Học sinh cũ và mới cần được duyệt từng khóa; đăng nhập hoặc có tên trong lớp không tự cấp quyền đọc bài/luyện tập. Admin duyệt mọi yêu cầu; giáo viên chỉ duyệt khóa mình là tác giả và xếp vào lớp mình sở hữu. Lịch sử kết quả được giữ nguyên. Không quay lại API cũ thiếu admission gates sau khi mở luồng đăng ký mới.

## Deploy và kiểm chứng

Dockerfiles hiện có hỗ trợ build native `linux/arm64` hoặc `linux/amd64`; tạo lại image và Prisma engine đúng kiến trúc, không sao chép Windows node_modules/dist. Compose/runtime/backup scripts trong `deploy/oci01b2` hiện có các guard dành cho Mac/Colima và các database/project được đặt tên cố định. Cần cấu hình và kiểm tra target homelab riêng trước khi chạy; không dùng nguyên cấu hình Mac hoặc bỏ qua guard. `CLP_EXPECTED_MIGRATIONS=11` dùng cho backup/fingerprint ở schema11; chỉ dùng mặc định10 khi target thực sự còn schema10.

Đã kiểm thử source trước bàn giao: 778 API + 60 Web tests, 74 integration tests (11 suites, 0 skip), 13 luồng Chrome/PostgreSQL cô lập; typecheck/lint/API-Web build PASS. Kiểm tra toàn repository về format còn 56 cảnh báo baseline ở file không đổi; được ghi trong hồ sơ ENROLL-01. Local Trial đã healthy và kiểm tra HTTPS/đăng ký tiếng Việt với Chrome en-US; Teacher/Student bằng tài khoản thật vẫn `PENDING_OWNER_MANUAL_TEST`.

Tài liệu chi tiết: [CORE-01](../Review/CORE-01-HANDOFF.md), [TOOLS-01](../Review/TOOLS-01-HANDOFF.md), [ENROLL-01](../Review/ENROLL-01-HANDOFF.md), [quyết định quyền học](../Architecture/ADR/ADR-006-course-admissions.md). Quyền tái sử dụng audio bên ngoài của Pinyin Studio chưa được xác nhận; giữ nguyên notice trong source khi chuyển máy.
