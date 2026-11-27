# DICT-02–04 — Bàn giao source để Independent Review

Ngày26/11/2026. Trạng thái: implementation + verification cô lập hoàn tất, **chưa nghiệm thu code/triển khai production**. Không có commit mới, stage, push, merge hoặc deploy trong checkpoint này.

## Source/workspace

- Original checkout: codex/core-product-completion, b191d162c4f965d9abf9a3a89a62cf373e9188d7; local main8fc28d3a45539c2de5ddb14b94c3a4f9127e0194.
- Worktree riêng: artifacts/dict01-worktree, branch codex/dict01-discovery-architecture, HEAD vẫn b191d162. Branch giữ tên DICT01 để tiếp tục cùng hồ sơ đã duyệt.
- Actual base = b191d162 + exact484-file frozen/deployed UI06 overlay. Không coi GitHEAD hoặc remote main là đủ source để rebuild bản đang chạy.
- Original bốn documentation WIP giữ nguyên; UI06/VI/EN/M06/Legacy/preservation/recovery không bị sửa. Dataset input vẫn ở Downloads, không copy vào Git.
- Files manifest và incremental/full patches nằm trong review package. Mỗi file có SHA256, phân biệt inherited UI06 overlay và dictionary delta.

## Đã triển khai

1. DICT02: module domain/application/repository/controller;12models/tables additive; import HTML/JSON/CSV an toàn; raw provenance, sources15groups/13URLs; checksum/parser/normalizer idempotency; transactions, immutable history, taxonomy cycle/depth guard.
2. DICT03:11endpoints additive, server search/ranking/cursor/sense pagination, real database lookup, detail/copy/error reporting, Vietnamese UI và ADMIN internal import/review receipt.
3. DICT04:6initial fields, source-derived category leaves, many-to-many links, descendant filtering, distinct counts và native specialty page. Combined Công xưởng May mặc được giữ như một nhánh nguồn; chưa khẳng định từng record thuộc riêng công xưởng hay dệt may khi chưa editorial review.
4. Student/Teacher navigation tích hợp cùng App/auth/client/design system. Không iframe, ứng dụng riêng, dependencies mới hoặc toàn corpus trong bundle.

Cả5content types được schema/API/filter hỗ trợ; initial import giữ UNCLASSIFIED để tránh tự gán WORD/TERM/PHRASE/SENTENCE khi chưa hiệu đính. Source labels Mẫu câu vẫn được giữ để reviewer phân loại sau; classified sentence counts không bị bịa.

## Dataset và governance

32573embedded input rows/0structural rejects →23266headwords/32563senses. Raw exact duplicates0;16rows có normalization,10additional duplicates sau clean. MissingEnglish1176. Giữ33497raw source associations; metadata33971không được coi là raw input có thể tái kiểm chứng.

Mọi record corpus thật INTERNAL/UNVERIFIED, source rights UNKNOWN. Không xuất bản thật, không specialist sign-off giả. Import không sửa headword đã hiệu đính: proposals vào REVIEW_REQUIRED, raw/source refs giữ nguyên. Source rights revocation chặn mọi learner read/count/detail. Source/category/review status audit là dictionary governance, không learning evidence.

## Test evidence

Xem docs/Dictionary/TEST-REPORT.md và raw r06receipts trong gói review:

-810API/90Web regression PASS;32targeted dictionary tests nằm trong810;70packaging/context tests PASS.
-17real-stack acceptance steps PASS trên disposable PG17.11/55441 và real NestJS/React/Chrome3116/5206.
-Baseline11→migration12 với existing synthetic identity/credentials/roles/session giữ rowcounts/ordered-content fingerprints19tables. 11old migration SQLs giữ nguyên.
-Actual HTML import/replay/concurrency/failure rollback, review preservation, category cycles/history constraints, filtered search/Pinyin ordering, CSRF/RBAC/rights revocation, whole-file HTTP streaming và browser1440/768/390.
-Benchmark50queries/5clients: corpus+1synthetic p95=103ms;100000total heads p95=212ms, Windows worker-only RSS khoảng78MiB. Không phải SLA homelab hoặc100000published learner entries.
-Prisma validate + isolated Windows31-model generate PASS; no shared dependency/client overwrite. Build/catalog/lint/typecheck PASS. Scoped format/secret/diff receipts trong manifest cuối.

Evidence inherited:37fixture browser scenarios chạy sau navigation integration; older CP05/CL01/admissions PostgreSQL suites không được provision/rerun trên targets riêng. Không claim full PG regression hoặc real HTTPS dictionary UAT.

## Điều chỉnh so với thiết kế

-Single atomic transaction trong bounded import thay vì staging commit rồi apply; không có partial canonical visibility/background job. Failed attempts không giả thành completed batch history.
-HTTP dry-run công bố ZERO dictionary writes, không ZERO session metadata writes: AuthGuard kế thừa vẫn touch last_used_at. Không đổi security contract của auth.
-Category detail dùng hierarchy+filtered search, không thêm endpoint detail riêng chưa có consumer.
-Scoped reverse-proxy upload limits/timeouts và CORS import headers là phần kỹ thuật bắt buộc; global64k/origin allowlist giữ nguyên. Backport baCOPY --chmod0644 theo R4 đã được Owner duyệt.
-Schema/model/table guard tests được mở rộng bằng đúng12names, không wildcard/skip/assertion weakening. Old migrations/role enums/evaluation/mastery không đổi.

## Còn ngoài scope hoặc chưa chứng nhận

-DICT05notebook, DICT06teacher sets/lesson bridge, DICT07CMS edit/category CRUD/publication/revision restore đầy đủ chưa làm; không có menu placeholder. Thư viện biểu mẫu/audio/AI không làm.
-Specialist review và quyền tái phân phối chưa xác nhận; corpus chưa đủ điều kiện learner publication.
-Native Linux AMD64 image/client/Nginx upload/runtime chưa chạy; source packaging runtime vẫn Mac-profile-specific, cần adapter homelab đúng đã nghiệm thu hoặc amendment trước triển khai.
-Fresh backup/restore live clone, old-pair compatibility schema12, Owner UAT, TLS/auth dictionary trên domain và CPU/RAM dưới cgroup homelab chưa chạy.
-Budget16MiB/100krows/1000taxonomy nodes/synchronous120s; proxy/Cloudflare timeout có thể ngắn hơn. Retry checksum an toàn; async importer chỉ xem xét nếu có measurement và approval riêng.
-Benchmark có50sample/10terms, internal queries; chưa cold cache/full compound-query plan/public100k/load profile. Không tự tăng container limits.

## Deployment/recovery decision

GO cho Owner Independent Code Review; NO-GO persistent rollout cho đến khi các gate trong HOMELAB-RELEASE-PLAN.md hoàn tất. Update dictionary cần API+Web+migration12 theo paired release, không thể dùng Web-only rollout. Giữ database/migration12 khi rollback application đã được chứng minh compatible; không reset/drop/seed.

User guides/import schema/API/security/taxonomy/model/ERD/test/performance/deployment/rollback đã có trong docs/Dictionary và docs/Planning/DICT01. Changelog: README/PROJECT_STATE chỉ cập nhật trong worktree này; original WIP không sửa. Không ghi commit SHA giả khi chưa commit.
