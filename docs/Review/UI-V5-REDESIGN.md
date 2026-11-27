# UI-V5 — Báo cáo đổi giao diện theo mẫu v5

Ngày 27/11/2026. Trạng thái: **IMPLEMENTED / OWNER REVIEW**; chưa commit, push, merge hoặc deploy. Website/homelab không được thay đổi trong checkpoint này.

## Baseline và phạm vi

- Worktree: `artifacts/ui-v5-worktree`; branch `codex/ui-v5-cultural-redesign`.
- Base: `dc44e9dcc14646bce3f6c9a5f8d26f69b9d07984`, kế thừa SEC-01 để không mất bản sửa xử lý credentials. Đây không phải tuyên bố SEC-01 đã deploy.
- Source HTML tham chiếu SHA-256: `3305ea7b92ebfeef0cc1990c790120302fc5cdeb597e833169f5f361629cc882`.
- Thay đổi cách trình bày; không thay đổi tính năng, workflow, route, handler, dữ liệu hay phân quyền.
- Ứng dụng chưa có landing route độc lập. Bố cục chào mừng được áp dụng vào màn hình đăng nhập/đăng ký hiện có; không thêm menu hoặc khóa học giả từ prototype.

## Thiết kế

| Token         | Giá trị               | Công dụng                            |
| ------------- | --------------------- | ------------------------------------ |
| Cream / paper | `#fff5ea` / `#fffcf6` | Nền và bề mặt                        |
| Red / coral   | `#b63c35` / `#f4776d` | Hành động chính, nhận diện           |
| Teal          | `#176477`             | Tiêu đề phụ, vùng nhấn, nút quay lại |
| Jade / sage   | `#91bdb0` / `#e0eee4` | Nhãn và vùng hỗ trợ                  |
| Ink / muted   | `#283c39` / `#596d64` | Chữ; muted đậm hơn mẫu để dễ đọc     |
| Focus         | Teal, 3px, offset 4px | Điều hướng bàn phím                  |

Bo góc 10/18/28px; khoảng cách 8/16/24/32px. Các nút/input chính tối thiểu cao 44px. Dashboard dùng trang trí tiết chế, không chèn tranh landing vào các màn hình vận hành.

Tiếng Việt/Latin/Pinyin dùng Noto Sans; chữ Hán thông thường dùng Noto Sans SC. `HỌC TIẾNG TRUNG` dùng Noto Sans 900; `学习汉语` dùng Noto Serif SC 900, không giãn chữ. Font Serif chỉ chứa bốn chữ của heading; nội dung Trung khác dùng Sans SC.

110 WOFF2 (4.943.156 byte tổng cộng) được self-host với unicode-range, trình duyệt tải subset cần thiết. Không có dịch vụ font ngoài lúc runtime, không cài dependency. `assets/fonts/MANIFEST.json` lưu URL nguồn, dung lượng và SHA-256 từng file. Ba license SIL OFL được giữ trong source và legal comment của CSS production. Nguồn: [Google Fonts Noto Sans](https://github.com/google/fonts/tree/main/ofl/notosans), [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc), [Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc).

Tranh WebP 1646×390 được lấy nguyên byte từ HTML tham chiếu: Thiên Đàn, Thiên An Môn, Vạn Lý Trường Thành, núi/cây/kiến trúc. Không thêm chim/hạc. SHA-256: `e8b57603a99906ca4bf5a9f3dbcef1c810b74a312242c15ad363edfe7948f4b0`. Tranh là nền trang trí `aria-hidden`; không che điều khiển.

## File thay đổi

Chỉ hai file có sẵn được sửa:

1. `apps/web/src/main.tsx`: thêm hai import CSS.
2. `apps/web/src/screens/LoginScreen.tsx`: wrapper bố cục, component chào mừng, thay artwork; heading đăng nhập thành h2 dưới hero h1. Giữ ID/label/thuộc tính tương tác, form và toàn bộ xử lý SEC-01.

File mới:

- `apps/web/src/CulturalWelcome.tsx`: JSX tĩnh, không state/handler/request.
- `apps/web/src/cultural-theme.css`: token và theme bổ sung, responsive/reduced-motion.
- `apps/web/src/assets/cultural-landmarks.webp`.
- `apps/web/src/assets/fonts/`: 110 font, CSS, manifest, ba license (115 file).
- `apps/web/test/cultural-browser.cjs`: kiểm tra Chrome và ảnh responsive bằng fixture API chỉ trong test.
- `apps/web/test/cultural-invariants.cjs`: chứng minh giới hạn presentation bằng AST/hash/diff.
- `docs/Planning/UI-V5-TASK.md` và báo cáo này.

Danh sách chính xác và hash từng file có trong `FILES.json` của gói review. Không sửa test cũ, dependency hoặc lockfile.

## Kiểm thử thực hiện

| Kiểm tra                                              | Kết quả                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Baseline API, trước sửa                               | 831/831, 59 suites PASS                                                                          |
| Baseline frontend, trước sửa                          | 95/95, 14 suites PASS                                                                            |
| API regression sau sửa                                | 831/831, 59 suites PASS                                                                          |
| Frontend regression sau sửa                           | 95/95, 14 suites PASS                                                                            |
| Lint / typecheck                                      | PASS toàn workspace                                                                              |
| API production build / catalog validation             | PASS; PREVIEW_ONLY, không xuất bản                                                               |
| Web production build                                  | PASS; lần chạy sandbox đầu bị Windows Access Denied, chạy lại cùng lệnh ngoài sandbox thành công |
| SEC-01 browser                                        | 13/13 PASS; autofill mô phỏng qua DOM, không phải xác nhận Chrome password manager thực tế       |
| Flashcard browser                                     | 9/9 PASS                                                                                         |
| Viết đáp án / cloze / IME browser                     | 5/5 PASS                                                                                         |
| Công cụ học tập browser                               | 5/5 PASS; có kiểm tra MP3 ngoài sau lựa chọn rõ ràng                                             |
| Visual/workflow matrix mới                            | 125/125 PASS, 25 màn hình/trạng thái × 5 chiều rộng                                              |
| Before matrix, source base                            | 125/125 PASS, cùng fixture chỉ trong test                                                        |
| AST/asset invariants                                  | PASS                                                                                             |
| Secret/artifact scan; scoped Prettier; Git diff check | PASS                                                                                             |

Matrix Chrome thật, React/Vite thật, API **mock rõ ràng trong test**, không dùng tài khoản/DB production. Browser `en-US`, OS color scheme dark vẫn hiển thị UI tiếng Việt và theme sáng. Chiều rộng 390, 768, 1024, 1440, 1920px; không tràn ngang trang, không page errors, không request fixture ngoài dự kiến; font/ảnh của matrix không gọi origin ngoài. Có kiểm tra focus, navigation chỉ GET, CSRF header và payload nộp đáp án qua handler gốc.

Bao gồm đăng nhập, đăng ký; Student overview/lớp/tham gia/bài được giao/tiến độ/đăng ký khóa học/tự học/bài tập/kết quả; Teacher và Admin overview/khóa học/giao bài/duyệt đăng ký; từ điển và chi tiết. Flashcard/viết đáp án/công cụ có harness riêng. Ảnh dùng dữ liệu synthetic, không được hiểu là evidence database thật hoặc UAT production. Ảnh trước/sau và JSON kết quả có trong gói review.

### Những gate cũ chưa PASS

Ba harness browser cũ được chạy nguyên bản, **không sửa hoặc bỏ assertion**:

- `student-dashboard-browser.cjs`: dashboard PASS; dừng khi nút quay lại phải có màu navy cũ `rgb(24,51,75)` thay vì teal mới `rgb(23,100,119)`.
- `teacher-dashboard-browser.cjs`: ba bước đầu PASS (empty/create/guide navigation); dừng ở assertion hero navy cũ thay vì teal.
- `ink-interface-browser.cjs`: dừng ở assertion nền cũ `rgb(243,246,249)` thay vì coral mới `rgb(244,119,109)`.

Đây là các assertion visual gắn với theme cũ, không phải baseline failure. Các bước phía sau điểm dừng của ba harness đó **không được chạy** trong harness cũ. Không tuyên bố toàn bộ browser suite PASS. Matrix theme mới bổ sung evidence nhưng không thay thế kết quả FAIL của các test cũ. Cần Owner/reviewer duyệt cập nhật visual expectation trong checkpoint riêng/phạm vi bổ sung nếu muốn các harness cũ xanh.

## Lệnh tái hiện

Chạy ở worktree UI-V5, dùng dependencies hiện có:

```powershell
npm test -w @clp/web
npm test -w @clp/api -- --runInBand
npm run lint
npm run typecheck
npm run build
node apps/web/test/cultural-invariants.cjs
$env:PLAYWRIGHT_MODULE='<đường dẫn Playwright đã cài>'
node apps/web/test/cultural-browser.cjs
node apps/web/test/flashcards-browser.cjs
node apps/web/test/typed-recall-browser.cjs
node apps/web/test/learning-tools-browser.cjs
# Chuẩn bị SEC01_EVIDENCE_DIR là thư mục riêng, rồi:
node apps/web/test/credential-browser.cjs
node apps/web/test/student-dashboard-browser.cjs
node apps/web/test/teacher-dashboard-browser.cjs
node apps/web/test/ink-interface-browser.cjs
npm run secret-scan
git diff --check
```

Port của từng harness phải trống; harness đóng tiến trình riêng. `cultural-browser.cjs` từ chối port 5212 đang dùng. Muốn ảnh trước: đặt `UIV5_SOURCE` trỏ tới worktree base sạch, không sửa source base. Scoped Prettier áp dụng các TSX/CSS/CJS/Markdown/JSON mới hoặc sửa, không format toàn repository. Log các gate cuối nằm trong gói review.

## Chứng minh không đổi logic và bảo toàn

`cultural-invariants.cjs` so sánh AST trước/sau của toàn bộ thân LoginScreen trước return: hook, state, validation, handlers giữ nguyên. Tag/thuộc tính form, input, button, label giữ nguyên thứ tự và nội dung. `main.tsx` giống base sau khi loại hai CSS import. Whitespace LF/CRLF được chuẩn hóa khi so AST.

Git diff của các file có sẵn chỉ gồm hai file trên. New-file allowlist không cho source backend/deployment lọt vào. API client, RBAC, cookies/session, CSRF, workflow, route, schema, migrations, dữ liệu và deployment config **không thay đổi**. Không lấy JavaScript/mock auth/mock khóa học từ prototype vào source ứng dụng.

- Root branch `codex/core-product-completion` vẫn HEAD `b191d162c4f965d9abf9a3a89a62cf373e9188d7`; bốn WIP tài liệu giữ nguyên trạng thái đã ghi nhận.
- SEC-01 worktree sạch, HEAD `dc44e9d...`; không đổi Main ref.
- VI WIP 16 file giữ fingerprint `a776a134ef721ca96a14839cf011564c996ee711963cbfa0b35b0af820b77061`; EN worktree sạch.
- Manifest DICT01 517/517, DICT07 524/524, UI06 484/484 file khớp SHA-256.
- Không SSH production, không ghi DB/migration/seed, không thay dịch vụ LP-01/homelab, không thay preservation branch hoặc recovery cũ.

## Blocker và giới hạn trước triển khai

1. **BLOCKED — Docker packaging:** `.dockerignore` hiện chỉ cho TS/TSX/CSS trong `apps/web/src`, chưa cho WebP/WOFF2. Vite local build PASS, nhưng Docker context hiện tại không chứa asset cần thiết. Giữ nguyên cấu hình theo yêu cầu. Cần phê duyệt riêng allowlist tối thiểu cho đúng ảnh/font và chạy context audit + image build trước triển khai; không mở rộng allowlist toàn bộ source/assets tùy ý.
2. **NOT_RUN:** build Docker Linux/ARM64/AMD64, browser/API PostgreSQL thật cho theme mới, homelab deployment/UAT và thiết bị vật lý iPad. Không cần thay DB để đổi theme; không dùng evidence lịch sử để tuyên bố các bước này PASS.
3. Ba browser visual expectation cũ FAIL như trên. Không cập nhật test khi chưa được duyệt.
4. Nội dung Lesson 01 vẫn preview/gated theo source base; không bật gate hoặc thay publication. Source behavior không thay đổi, không có preview runtime mới trong checkpoint này.
5. Quyền sử dụng tranh tham chiếu dựa trên tài liệu Owner cung cấp; cần Owner xác nhận nguồn/license trước phân phối nếu chưa có. Font giữ nguyên notices/OFL.
6. Ảnh desktop/mobile đã xem trực quan; matrix tự động không thay thế review người dùng, screen-reader audit hoặc đánh giá mọi tổ hợp dữ liệu dài.

Rollback source: bỏ riêng theme imports và phục hồi LoginScreen từ base; các file mới có thể giữ ngoài build. Không có rollback dữ liệu. Đây là hướng dẫn, chưa thực hiện thao tác rollback hoặc deploy.

**Scope/contracts changed: NO. Dừng ở Owner review.**
