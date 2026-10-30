# CORE-01 — Bàn giao source và demo

Ngày: 30/10/2026. Trạng thái: luồng cốt lõi đã triển khai và kiểm chứng, chờ Owner nghiệm thu. Không tuyên bố hoàn tất mọi phần mở rộng P2.
Nhánh: `codex/core-product-completion`, nền CL-01 `22bf765`. Workspace ban đầu ở main `8fc28d3`, thiếu CL-01/VI-01; đã tạo nhánh mới từ commit CL-01 hiện có, không merge hoặc tạo commit.

## Rà soát ban đầu và phần tái sử dụng

| Module | Phân loại trước thay đổi | Kết quả CORE-01 |
|---|---|---|
| Authentication | 1 — luồng cookie/session/CSRF/RBAC đã hoạt động | Giữ nguyên; chạy hồi quy |
| Course | 2 — API tạo/đọc, thiếu quản lý nội dung qua web | Tạo và chỉnh sửa khóa học; điều hướng chương/bài |
| Class | 1 — tạo lớp, roster, ownership và workspace có sẵn | Thêm chỉnh sửa metadata, dashboard số liệu thực |
| Enrollment | 1 — CL-01 invitation/join/exact-login hoạt động trên nhánh CL-01 | Tái sử dụng nguyên cơ chế, hồi quy PostgreSQL đạt |
| Lesson | 2 — có tạo/đọc metadata, thiếu editor/publish/edit và viewer dữ liệu thật | Editor, nháp, preview, xuất bản, chỉnh sửa và viewer |
| Content | 2 — schema và API các loại nội dung đã có | UI cho văn bản mô tả, VOCABULARY/CHARACTER/GRAMMAR/EXAMPLE/MEDIA_REFERENCE |
| Vocabulary/Hanzi/Pinyin | 2 — field/validation/generator có sẵn, thiếu authoring UI | Nhập/đọc chữ Hán, Pinyin, nghĩa Việt và ví dụ |
| Exercise/Quiz | 1 — có generator/evaluator/submission/recovery và web | Tái sử dụng; lọc mục thiếu field để media không làm hỏng queue |
| Assignment | 1 — API và GUI từng học viên; CL-01 học viên xem/luyện tập | Thêm giao theo roster lớp, viewer bài được giao, thời hạn UTC+7 |
| Progress | 1 — evidence/mastery và số liệu thật; chưa có quy tắc hoàn thành bài | Thêm hoàn thành theo quy tắc Owner, lịch sử kết quả và tổng quan |

Không thay API thực bằng mock. Các màn hình Lesson Preview tĩnh cũ không được tính là Lesson Builder hay viewer bài được giao.

## Hành vi đã triển khai

1. Teacher tạo khóa học → chương → bài học bằng GUI, thêm nội dung tiếng Trung/Pinyin/tiếng Việt/ví dụ, thêm/xóa/sắp xếp các mục.
2. Lưu nháp trên PostgreSQL, mở lại sau reload, preview dùng cùng renderer với học viên, xuất bản.
3. Editor cảnh báo khi rời trang có thay đổi, khóa điều hướng khi đang ghi; revision kiểm tra trong transaction có khóa để từ chối ghi đè từ editor cũ. Đọc composition dùng snapshot RepeatableRead để tránh lộ nội dung nháp khi xuất bản thay đổi đồng thời.
4. Tạo/chỉnh sửa lớp, dùng Enrollment CL-01 và giao bài từ khóa/chương/bài đã xuất bản. Giao lớp tái dùng từng assignment hiện có; không tạo mô hình giao bài thứ hai. Khi ghi, workspace và picker bị khóa; lỗi một phần và 401 được xử lý rõ ràng.
5. Học viên thấy bài được giao, mở nội dung thật, điều hướng các phần, nghe audio/xem hình từ HTTPS nếu có. Pointer bài và vị trí đọc lưu theo public ID tài khoản, chỉ khôi phục sau khi server xác nhận assignment còn truy cập được. Không cache nội dung hoặc cookie/token.
6. Làm bài với CP-02/CP-05, xem kết quả và mở lại tối đa 20 lượt gần nhất trong phạm vi 30 ngày. Lịch sử kết quả vẫn qua endpoint kiểm tra ownership.
7. Owner chọn quy tắc hoàn thành: mỗi mục luyện tập hiện tại có chữ Hán và nghĩa phải được trả lời đúng ít nhất một lần. Tính từ evidence ANSWER_SUBMITTED đúng, mọi thời điểm, gồm tự học cùng bài. Không có mục luyện tập thì chưa hoàn thành. Không tạo điểm/grade/mastery mới.
8. Giữ ID mục không thay đổi khi lưu/sắp xếp. Nội dung mục thay đổi được cấp ID mới; mục cũ, exercise đã nộp và evidence được giữ. Vì vậy nội dung mới cần được luyện lại theo quy tắc hoàn thành đã chọn.
9. Teacher dashboard có tổng khóa học sở hữu, lớp sở hữu, học viên duy nhất, bài đã xuất bản và lượt giao/hoàn thành/chưa hoàn thành. Completion được đọc theo batch tối đa 100 cặp học viên/bài mỗi batch.
10. UI Việt mặc định tiếp tục từ VI-01, ngày `dd/MM/yyyy` và thời gian Việt Nam. Không thay cách lưu UTC, không phụ thuộc locale browser/server. Responsive dùng chung token, card, form, navigation; đã kiểm tra desktop/mobile và tablet 768 × 1024 bằng trình duyệt thật.

## Kiểm thử và review

| Kiểm tra | Kết quả |
|---|---|
| Targeted authoring/content service | 19/19 ở vòng đầu; sau đó thêm stale-revision/completion/class tests và chạy toàn bộ |
| `npm test` | API 761/761, web 49/49; tổng 810 đạt |
| Full PostgreSQL integration trên ba cluster mới | 10 suite, 63 test đạt; 11 test demo-seed bị skip do target demo riêng không bật |
| Browser E2E dữ liệu thật | 8 nhóm kiểm tra đạt; xem `artifacts/core-01/results.json` |
| `npm run lint` | Đạt |
| `npm run typecheck` | Đạt |
| `npm run build` | API và SPA đạt; Vite cần chạy ngoài sandbox vì hạn chế đọc thư mục cha của esbuild |
| Prettier cho toàn bộ 39 file source/test thay đổi | Đạt |
| `npm run verify` / định dạng toàn repo | Chưa đạt do lỗi định dạng baseline ở các file cũ; không định dạng lại các module ngoài phạm vi |
| Independent source review và hai lần re-review | Đã xử lý các finding; vòng cuối không còn blocker trong phạm vi được review |

Lần gọi integration mặc định ban đầu thất bại vì thiếu target riêng và sandbox chặn đọc .env; đã chạy lại với URL tường minh trên PostgreSQL mới. Không dùng database hiện có. Integration evidence nằm ở `artifacts/core-01/integration-results.json`. Các cluster test đã dừng; dữ liệu chỉ nằm dưới `.core-demo/` được gitignore.

Browser dùng Chrome headless, locale `en-US`, giáo viên timezone `America/New_York`, học viên timezone UTC; API `TZ=UTC`, `LANG=C.UTF-8`. Luồng kiểm tra thật gồm soạn hai mục, xóa/sắp xếp, nháp/reload/preview/publish, tạo/ghi danh/giao lớp, đọc/reload, nộp bài tới khi cả hai mục đúng, mở lại lịch sử, teacher thấy completion. Negative tests chặn thiếu CSRF, student write, teacher khác write, stale revision. Đây không phải chứng nhận tương thích mọi browser/OS.

Review phát hiện và đã sửa: draft-read race, stale saves, mất thay đổi khi điều hướng, thiếu resume, batch assignment che lỗi/401, điều hướng trong batch và N+1 ở completion. Review đọc source độc lập; các kết quả runtime do main agent thực hiện.

## File chính

- `apps/web/src/curriculum/{api.ts,Curriculum.tsx,Lesson.tsx,curriculum.css}` — quản lý và đọc/soạn nội dung.
- `apps/web/src/teacher/{TeacherWorkspace.tsx,TeacherForms.tsx,TeacherViews.tsx,model.ts,teacher.css}` — dashboard/lớp/giao bài/kết quả và thời gian Việt Nam.
- `apps/web/src/classrooms/StudentWorkspace.tsx`, `apps/web/src/App.tsx`, `apps/web/src/api/{teacher.ts,classrooms.ts}`, `apps/web/src/index.css` — học viên, history, resume, UI chung.
- `apps/api/src/modules/content/{application,http,infrastructure}` — API đọc/save/course edit, revision, snapshot, transaction và completion batch reader.
- `apps/api/src/modules/teacher/{application,http,infrastructure}` — overview, class metadata, assignment completion.
- `apps/api/src/modules/classrooms/{classroom-contract.ts,classroom.repository.ts}` — projection completion và lịch sử của học viên.
- `apps/api/src/modules/student/application/student-service.ts` — lọc mục không đủ field cho mode hiện có.
- `apps/api/test/protected/{core-authoring.spec.ts,lesson-completion.spec.ts,teacher-service.spec.ts}` và các fake/type support liên quan; `apps/web/test/{curriculum.spec.tsx,vietnamese-ui.spec.tsx,core-realstack.cjs}` — kiểm thử.
- `README.md`, `.gitignore`, `docs/Planning/CORE-01-TASK-CONTRACT.md`, tài liệu này và `artifacts/core-01/` — bàn giao.

## Ảnh giao diện thật

- [Teacher desktop](../../artifacts/core-01/teacher-desktop.png)
- [Trình soạn bài desktop](../../artifacts/core-01/teacher-builder-desktop.png)
- [Teacher mobile 390 × 844](../../artifacts/core-01/teacher-mobile.png)
- [Student desktop](../../artifacts/core-01/student-desktop.png)
- [Student mobile 390 × 844](../../artifacts/core-01/student-mobile.png)
- [Student tablet 768 × 1024](../../artifacts/core-01/student-tablet.png)
- [Teacher xem kết quả](../../artifacts/core-01/teacher-results.png)

## Chạy demo cô lập để Owner nghiệm thu

Môi trường đã dùng: Windows, PostgreSQL 17 tại `C:/Program Files/PostgreSQL/17/bin`, Chrome, Node/npm đã cài dependency. Không cần Docker/Tailscale/Mac mini. Script từ chối chạy nếu các cổng `55441`, `3113`, `5198` đang được sử dụng và luôn tạo cluster mới, không reset/reuse cluster cũ.

PowerShell từ root repository:

```powershell
npm run db:generate
npm run build
$env:NODE_PATH = 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:CORE01_DISPOSABLE = 'YES'
node apps/web/test/core-realstack.cjs
```

Đây là demo tự động qua GUI, tạo ảnh/results và tự dừng. Để giữ demo cho kiểm tra thủ công, đặt mật khẩu synthetic tạm thời của riêng bạn (ít nhất 12 ký tự) trước lệnh `node`:

```powershell
$demoSecret = Read-Host 'Mật khẩu demo tạm thời' -AsSecureString
$env:CORE01_DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $demoSecret).Password
$env:CORE01_KEEP_RUNNING = 'YES'
node apps/web/test/core-realstack.cjs
```

Sau các kiểm tra đạt, mở `http://127.0.0.1:5198`. Đăng nhập `teacher.core@example.invalid` hoặc `student.core@example.invalid` với mật khẩu vừa đặt. Có sẵn khóa/lớp/bài synthetic; Owner có thể tự tạo bài mới. Nhấn Ctrl+C trong terminal để dừng browser/API/Vite/PostgreSQL do script tạo. Sau đó xóa các biến env demo khỏi terminal:

```powershell
Remove-Item Env:CORE01_DEMO_PASSWORD, Env:CORE01_KEEP_RUNNING, Env:CORE01_DISPOSABLE -ErrorAction SilentlyContinue
```

Không ghi mật khẩu vào source hoặc log; không dùng mật khẩu thật. Các bước trên không deploy và không sử dụng cấu hình Local Trial.

## Giới hạn và trạng thái nghiệm thu

- Bài tập dùng bộ sinh/chấm nội dung hiện có; chưa có editor ngân hàng quiz tùy ý hoặc rubric/grade mới.
- Media dùng HTTPS reference, chưa upload/storage. Grammar/dialogue dùng loại GRAMMAR/EXAMPLE có sẵn; các field ngắn vẫn giữ giới hạn 200 ký tự của hợp đồng hiện có. Phần mô tả bài hỗ trợ văn bản dài.
- Giao theo roster hiện hiển thị tối đa 200 học viên; không atomic toàn lớp. Bài đã tồn tại được giữ nguyên hạn nộp, lỗi một phần được báo để giáo viên kiểm tra hồ sơ.
- Lưu DRAFT cho bài đang PUBLISHED tạm ẩn bài khỏi học viên đến khi xuất bản lại; chưa có hai phiên bản nháp/phát hành song song.
- Resume vị trí đọc là local trên cùng browser, không đồng bộ nhiều thiết bị. Điểm/kết quả/hoàn thành lưu server qua evidence và vẫn còn sau đăng nhập lại.
- Chưa nghiệm thu deploy/mọi browser/mọi OS; 11 demo-seed integration test chưa chạy. Định dạng baseline toàn repo còn lỗi. Chưa đóng checkpoint với tuyên bố mọi gate PASS.

Migration: không có. Cấu hình phục vụ: không đổi. Không chạy migration hoặc ghi database thật. Scope: vẫn trong master directive; contract được mở rộng bằng API authoring/read/overview/class edit và quy tắc completion Owner đã chọn. Chưa commit/push/merge/deploy. Dừng ở source/demo chờ Owner nghiệm thu.
