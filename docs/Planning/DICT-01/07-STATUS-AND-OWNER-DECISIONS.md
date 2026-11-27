# DICT01 — Trạng thái và Owner decisions

## Đã làm

Repository/worktrees/remote/deployed UI06 baseline xác minh; branch codex/dict01-discovery-architecture riêng. Baseline b191d162 + exact484source overlay; original WIP/index/worktrees/runtime giữ nguyên.

Dataset inertJSON đã phân tích thật; private parser15/15synthetic tests PASS. Có spec/ERD/taxonomy/API/dependency/acceptance/security/benchmark/ops plan. Không application implementation, migration mới hoặc dictionary UI để nghiệm thu; không gọi module hoàn tất.

## Cần Owner duyệt trước DICT02

1. Headword/senses và12bảng additive foundation/governance; migration12 giữ nguyên11migration cũ. Notebook/teacher set tables mở sau theo task.
2. Normalizer NFC/strip U+200B/U+FEFF/trim/collapse whitespace, raw retained:32573input →32563sense candidates/23266headwords. Search-fold không là identity.
3. ADMIN-only internal review/import, không thêm EDITOR; TEACHER không global publish. Learner rights-confirmed+verified+published; corpus thật tiếp tục internal khi chưa có rights/specialist approval.
4. pg_trgm/index experiment trên target disposable cụ thể. Đề xuất PG17 loopback55441/db clp_dict_test, API3116/UI5206; chưa provision/chạy. Target này cần xác nhận trước tạo/migrate/test.

Rights/specialist review có thể tiến hành song song xây pipeline/search internal với synthetic learner fixtures; không tự mở public access.

## Milestone/evidence

| Hạng mục                                 | Trạng thái                                                          |
| ---------------------------------------- | ------------------------------------------------------------------- |
| DICT01 audit/spec/architecture package   | PREPARED, chờ design review                                         |
| DICT02 foundation                        | NOT_STARTED, model/migration approval pending                       |
| DICT03 core / DICT04 specialized         | NOT_STARTED                                                         |
| DICT05 notebook /06teaching /07CMS       | NOT_STARTED, dependency đề xuất                                     |
| DICT08 release hardening                 | NOT_RUN                                                             |
| Audit parser                             | 15/15PASS; file thật32573valid/0structural rejected                 |
| DB import/search/idempotency/performance | NOT_RUN; DB imported rows0                                          |
| Dictionary API/Web/browser tests         | NOT_RUN, chưa implement                                             |
| Existing UI06 tests                      | INHERITED 83Web/778API/23fixture browser; không là dictionary tests |
| Homelab                                  | READ_ONLY healthy/live200/ready200; không query DB/load test/write  |
| New commits/source deploy                | Không có                                                            |

## Mapping yêu cầu báo cáo tổng thể

Initial/final Git/branch:00; architecture/modules/model/migration impact:02; actual input/dedup/missing/categories:04; APIs:03; proposed interfaces/Việt ngữ:01; tasks/tests/benchmark NOT_RUN:05; security/publication/deploy/backup/rollback:06; completed/incomplete/limitations/Owner gates:07.

User/Teacher/Admin operational guides, product screenshots, measured benchmarks và deployment/import commands sẽ phát hành theo module thực thi; không viết hướng dẫn giả cho tính năng chưa có. Private inspector không phải production importer. Không copy full corpus vào source/review package. No new commit SHA.
