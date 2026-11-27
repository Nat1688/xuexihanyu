# DICT-01 — Khảo sát và thiết kế từ điển chuyên ngành

Ngày: 26/11/2026. Trạng thái: DESIGN PROPOSED, chờ Owner duyệt kiến trúc. Chưa triển khai DICT-02–08.

## Task contract

Nguồn yêu cầu: chỉ thị Specialized Chinese Dictionary and Vocabulary Learning Module và HTML v4 do Owner cung cấp. Mục tiêu DICT01: xác minh source/dataset, chuẩn bị specification, mô hình quan hệ, taxonomy, API, kế hoạch và acceptance trước implementation theo AGENTS.md §3.

Allowed files: tài liệu mới trong docs/Planning/DICT-01; công cụ/evidence phân tích riêng ở artifacts/dict01-audit-20261126. Không sửa application, schema, migration, Main, WIP hoặc runtime. Không commit/stage/push/deploy. Không iframe, ứng dụng riêng, audio/TTS/microphone/AI. Không đưa third-party corpus vào Git hoặc Docker context.

## Git và source thực tế

| Thành phần          | VERIFIED                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout gốc        | codex/core-product-completion; b191d162c4f965d9abf9a3a89a62cf373e9188d7                                                                                             |
| Local main          | 8fc28d3a45539c2de5ddb14b94c3a4f9127e0194                                                                                                                            |
| Remote feature/main | ls-remote: b191d162… / 46f8c584…                                                                                                                                    |
| Worktree mới        | artifacts/dict01-worktree; codex/dict01-discovery-architecture                                                                                                      |
| Baseline thực dùng  | b191d162 + exact 484-file frozen UI06 overlay đã duyệt/triển khai, overlay chưa commit                                                                              |
| Checkout WIP        | PROJECT_STATE.md và HOMELAB-HANDOFF.md modified; hai review docs BASELINE-REVALIDATION-2026-11-25.md / PROJECT_STATE-TW01-HISTORICAL.md untracked; index giữ nguyên |
| Spec Kit            | Không có .specify; dùng docs/Planning và ADR hiện tại                                                                                                               |
| Lockfile            | NestJS core11.2.6, React19.3.0, Vite6.4.3, Prisma/Client6.19.3, Zod3.25.76                                                                                          |
| Persistence         | 19 Prisma models, 11 migration directories; migration ledger là bảng kỹ thuật thứ20                                                                                 |

README/HANDOFF còn ghi Mac và UI02 chưa triển khai: đó là thông tin lịch sử. Mac đã factory reset theo Owner. UI03–UI06/flashcards đang chạy là frozen overlay, không có sẵn khi checkout b191d162 hoặc local main. Không sửa tài liệu WIP gốc trong task này.

## Reuse và khoảng trống

- Identity: opaque session cookie, AuthGuard → RoleGuard, ADMIN/TEACHER/STUDENT; actor server-derived. Dùng lại CSRF cookie/header/session-hash.
- Web: request GET/POST, credentials include, no-store, POST echo X-CSRF-Token; canonical vi-VN, local SVG/Ink artwork, existing responsive shell. Không thêm i18n dependency.
- Content: Course → Unit → Lesson, Chinese-aware LearningItem; draft/save/revision/ownership/publication. Chưa có dictionary senses/source/rights/taxonomy/import/editorial history.
- Enrollment: class membership không thay course approval. Từ điển không được vượt CourseAccessService để mở bài.
- Exercise: bốn modes ZH_TO_VI, VI_TO_ZH, ZH_TO_PINYIN, PINYIN_TO_ZH; MCQ/TYPING. Giữ normalization/evaluation/MCQ ordering.
- CP05: snapshot, stable submission token, idempotent recovery/evidence; mastery lock transaction và full evidence replay. Dictionary browsing không tạo learning writes.
- Flashcards: tái sử dụng presentation và written recall; hiện state trong tab, không durable notebook/SRS/mastery. Không gọi familiarity là mastery.

Nguồn đối chiếu: AGENTS.md; README; PROJECT_STATE; Architecture/BASELINE và ADR003/004/005/006; CORE01 task contract; Prisma schema/migrations; content/identity/admissions/student/exercise/mastery; UI06 Student/Teacher/flashcards/client/ui-vi; deployment/database guards.

## Homelab read-only probe

vaio-homelab x86_64, RAM tổng3,71GiB/available khoảng2,25GiB; root215,2GiB/available192,4GiB. API limit768MiB/1CPU, DB768MiB/0,75CPU, Web128MiB/0,1CPU. Ba container healthy; liveness/readiness HTTP200, database up. Không load test, không DB query, không đọc env/secrets.

Web image2c91c0bb… UI06; APIcaaadc27…; DB839fbb5a…. API/DB IDs không đổi. PostgreSQL17.11/schema11 là evidence trước đã nghiệm thu, chưa tái query ledger trong DICT01; health up không chứng minh migration integrity. JSON probe riêng lưu selected safe fields.

## Hồ sơ

- 01-FEATURE-SPEC.md: tính năng/quyền/Việt ngữ.
- 02-DATA-MODEL-ADR.md: normalized model, ERD, import/search.
- 03-API-CONTRACTS.md: endpoints/DTO/compatibility.
- 04-DATA-QUALITY-AND-TAXONOMY.md: số thực và mapping nguồn.
- 05-IMPLEMENTATION-AND-ACCEPTANCE.md: tasks/tests/benchmark.
- 06-SECURITY-OPERATIONS-AND-GATES.md: security/recovery/release gates.
- 07-STATUS-AND-OWNER-DECISIONS.md: kết quả và quyết định cần duyệt.
