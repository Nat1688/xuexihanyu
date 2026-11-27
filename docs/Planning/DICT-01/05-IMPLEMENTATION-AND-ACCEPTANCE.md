# Implementation plan và acceptance

## Dependency và task breakdown

DICT01 spec/ADR → Owner design approval → DICT02 model/import → DICT03 search/API/UI → DICT04 chuyên ngành → independent review/full regression → separate deployment approval. Sau đó DICT05 notebook → DICT06 teacher sets/lesson integration → DICT07 CMS đầy đủ → DICT08 release hardening. Security/governance không đợi đến DICT08 mới làm.

| Task             | Files/modules dự kiến                                   | Acceptance                                                                       |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D01 audit/spec   | docs/Planning/DICT-01, private analysis evidence        | counts/provenance/source/worktrees xác minh                                      |
| D02 schema       | Prisma schema, additive migration12, db tests           | 11migration cũ byte-identical, FKs/uniques/defaults/cycle concurrency            |
| D03 domain/ports | dictionary domain/application/infrastructure            | identity khác search keys; một reader visibility policy                          |
| D04 import       | adapters + private command + tests                      | inert HTML/CSV/JSON; dry-run0write; atomic/idempotent/concurrent; reconciliation |
| D05 search       | dictionary HTTP/repository + app.module                 | indexed ranking, stable cursor, count/distinct/visibility                        |
| D06 web          | web dictionary/client/Teacher+Student nav               | vi, search/detail/categories; no full corpus bundle/audio                        |
| D07 tests        | db/http/browser disposable harness                      | real corpus, failures/retry, auth/CSRF/RBAC, benchmarks/screenshots              |
| D08 ops          | exact backup/context/fingerprint/deployment guard files | final schema/table allowlist derived from migration; restore clone; no live run  |

DICT05–07 có task contracts và schema amendments sau, không tự thêm bảng dự phòng hoặc đổi mastery.

## Data acceptance

- I01: 32573 rows = valid+rejected;15source categories/13URLs; no script execution.
- I02: raw exact duplicates0; proposed normalizer merges10 →32563senses/23266headwords. Preserve all raw32573 origins;33497initial source-category associations →33487candidate canonical sense-category associations, không mất raw provenance.
- I03: alternate Pinyin/meanings preserved; no fake translations/examples/licenses.
- I04: repeated file same batch receipt, no new canonical data; changed file adds origin/senses without overwrite VERIFIED.
- I05: stage/apply/revision/commit injected failures, concurrent identical/different source, interruption/retry → no partial visible catalog.
- I06: missingEnglish allowed, malformed/bounds/invalidcat/controlchars quarantined with reason; reconciliation covers every input row. Only syntactic valid is not editorial correct.

## Search/security acceptance

- S01: anonymous401; ADMIN-only import/editor; TEACHER cannot publish; STUDENT cannot read restricted direct/detail/count/related/reportIDs.
- S02: every POST missing/invalidCSRF denies before write; valid token cannot override ownership/RBAC; body publicId/authorId/rights cannot bypass service.
- S03: XSS text escaped, scripts never run, upload path traversal/URL fetch/oversize/MIME mismatch denied; no logging credentials.
- S04: UNKNOWN/UNVERIFIED never learner-visible; rights revoke/category deactivate recheck direct reads/search/count/export.
- Q01: 合同/hétóng/hetong/he tong/Hợp đồng/hop dong/contract locate same authorized fixture; đ/d and ü/v/u ambiguity tested without storage/evaluation conflation.
- Q02: ranking1–5; cursor/query/filter/version binding; literal %, _, backslash/SQL injection/invalid sort/UUID/limits.
- Q03: concurrent category moves cannot make cycles; parent counts DISTINCT; empty branches not advertised as populated.

## UI và regression

- U01: Vietnamese UI even en-US browser; preserve Han/Pinyin/English meanings; no technical enums/raw errors.
- U02: 1440/768/390×844, long sentences/missingfields, keyboard/focus/status; loading/empty/error/retry/stale search; no audio controls.
- U03: browser real API/disposable PG; synthetic fixtures clearly labeled, not claimed real-stack.
- R01: targeted first then full API/Web incl CP05 retry/concurrency/late evidence, MCQ, CL01/admissions/authoring/ownership/logout/expiry. No fake mastery/completion.
- R02: lint/typecheck/build/catalog/Prisma validate/secret/artifact/diff/scoped format; full repository format debt reported separately.

## Performance experiment — NOT_RUN

Approved disposable PG17 only. First real32573 input rows; then deterministic synthetic variants for100000headwords, separate labels so synthetic volume is not called real corpus. Record CPU/RAM/PG/client, import duration/peakRSS, DB/WAL/index sizes, search query plans.

100cases exact/common/rare/onechar/no-match, combined category/type, page1/deep keyset, count cost. Cold/warm p50/p95/p99;1/5/10bounded test clients; resource usage and isolated baseline learning latency comparison. EXPLAIN(ANALYZE,BUFFERS) only disposable; no live load test.

Initial targets for review: warm search p95≤300ms at5clients, API typical-search RSS<512MiB. Import throughput/timeout budget determined by actual measurement; no invented number. Verify768MiBAPI/DB limits under import; optimize bulk/index/shortquery behavior before release, no auto change homelab limits. pg_trgm privilege/extension requires approval; do not silently substitute unbounded ILIKE.

## Commands

After implementation use existing npm workspace jest scripts, lint/typecheck/build. New integration harness needs specific target approval first. Current inspect_dataset.py is private audit, not production importer. There is no dictionary import command yet; do not use DS01 seed for this corpus. Operational/user guides and screenshots ship when executable feature exists, not placeholder manuals.

Schema guard impact: scripts/secret-scan.cjs có allowlists APPROVED_MODELS/APPROVED_TABLES; DICT02 cần update đúng các tên đã duyệt, kèm negative regression để không nới cho bảng tùy ý. deploy/oci01b2/database.cjs có hardcoded schema10/11 và Mac context; cần homelab schema12 guard riêng được kiểm thử, không bypass.
