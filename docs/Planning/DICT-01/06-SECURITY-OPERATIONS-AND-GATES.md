# Security, vận hành và approval gates

## Publication fail-closed

Chưa có bằng chứng quyền tái xuất bản tiengtrungnet.com hoặc specialist sign-off. Sources/entries UNKNOWN/UNVERIFIED; internal ADMIN review only. Learner reader cần PUBLISHED+VERIFIED+rights CONFIRMED. Import/dedup không xác lập license. Không public internal counts/metadata. Rights evidence phải được Owner/editor hợp lệ xác nhận, không AI tự ký.

Không corpus HTML/JSON trong Git/frontend/Docker/review ZIP. Chỉ hash/statistics/parser/synthetic tests được package. Raw input ở private Owner path, không copy source corpus. No eval/iframe/script/audio. Future data mount private, not build context. No external source fetch in DICT01.

## Migration/recovery proposal

Migration12 additive sau model approval; không sửa11migration cũ, không backfill accounts/sessions/evidence. Không down/reset/drop. Update exact expected-schema/table guards sau khi model finalized; không dùng M07.5 9→10 hoặc Mac hardcoded profile làm homelab plan.

Trước release: actual ledger/checksums, encrypted backup+restore empty isolated clone, existing business-table fingerprints, API/Web pair IDs, capacity and rollback gate. Fingerprints đối chiếu trên consistent clone; activity người dùng live không bị diễn giải thành data loss. Không yêu cầu Mac hoặc backup Mac.

Application rollback: disable new dictionary surface, restore approved API/Web pair giữ course admission enforcement, retain migration12/data. Test oldAPI compatibility với schema12 ở disposable. Không delete notes/events/import history hoặc downgrade DB để rollback feature. Restore DB chỉ incident recovery riêng có approval.

Import failure: staged/failed batch invisible; apply atomic; retry by checksum+versions safe; archive/new revision có audit, không xóa original source/provenance. Source quyền bị revoke không rollback sang public image/cache lộ nội dung cũ.

## Risk register

| Risk                                 | Severity | Mitigation                                                       |
| ------------------------------------ | -------- | ---------------------------------------------------------------- |
| Unknown redistribution rights        | HIGH     | INTERNAL default, evidence trước public                          |
| Unverified professional translations | HIGH     | sense-level specialist review, no correctness claims             |
| Collapse homographs/Pinyin/meanings  | HIGH     | strict identity, senses, raw immutable provenance                |
| Import overwrites reviewed revision  | HIGH     | no overwrite + transaction/unique/revision conflict              |
| Restricted search/count/detail leak  | HIGH     | same server predicate everywhere, negative tests                 |
| Untrusted HTML/XSS/upload            | HIGH     | inertJSON/text rendering/bounds/no URL fetch                     |
| Import/search trên4GB                | MEDIUM   | real disposable benchmark/chunks/index limits, no live load test |
| pg_trgm privilege unavailable        | MEDIUM   | approval/preflight, no silent full-scan fallback                 |
| Git/runtime drift                    | HIGH     | exact deployed UI06 overlay fingerprints, no old-main-only base  |
| Backup/context guard schema bounds   | HIGH     | schema12/table allowlist tests/restore before release            |
| False mastery from reference use     | HIGH     | no evidence in02–04, approved snapshot bridge in06               |

## Approval boundary

AGENTS.md §3 yêu cầu REQUEST → SPEC → ARCHITECTURE → OWNER APPROVAL → IMPLEMENT. Chỉ thị tổng thể yêu cầu chuẩn bị spec/model trước implementation; hiện chưa có approved ADR/schema cụ thể cho dictionary. Hồ sơ DICT01 cung cấp kết quả để duyệt additive tables, roles, canonical normalizer, publication gate và search-index experiment. Không cần duyệt lại việc đọc source/phân tích file.

Editor mới, đổi mastery/evaluation hoặc public access cần riêng task amendment. Không có live deployment approval trong yêu cầu từ điển này. Không stage/commit checkpoint trước independent review theo lifecycle.
