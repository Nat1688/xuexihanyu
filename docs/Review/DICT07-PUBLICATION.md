# DICT07-P — Xuất bản theo toàn bộ nhóm chuyên ngành

Ngày26/11/2026. Status: IMPLEMENTED/VERIFIED, chờ Owner Independent Review. Chưa deploy và chưa xuất bản corpus thật.

## Thay đổi và phạm vi

Owner yêu cầu nút xuất bản và chọn toàn bộ nhóm chuyên ngành. Worktree `codex/dict07-publication` kế thừa frozen517-file source DICT02–04/UI06 tại b191d162. Không sửa source/worktree bản đã triển khai, Main hoặc các WIP khác. Đây là mở rộng giới hạn của CMS contract DICT01, không full CMS hay learning integration.

ADMIN có khu vực **Xuất bản theo nhóm chuyên ngành**, chọn nhóm/subtree và xem preview. Thống kê total/published/unverified/shared entries, mọi nguồn liên quan và blockers. Có xác nhận quyền nguồn với evidence/revision/audit, xác nhận đã rà soát toàn bộ nhóm, ghi reference và xác nhận ảnh hưởng đa nhóm trước khi publish. Chỉ người có quyền và căn cứ thực tế được xác nhận; không có quyền nguồn hoặc specialist sign-off nào được agent tự tạo cho corpus thật.

**Xuất bản toàn bộ nhóm** chuyển trạng thái đủ điều kiện sang VERIFIED/PUBLISHED trong một transaction. **Gỡ xuất bản toàn bộ nhóm** chỉ chuyển PUBLISHED→INTERNAL, không xóa nghĩa/nguồn/lịch sử, không đổi DRAFT/ARCHIVED hoặc hạ verification. Mục đã ARCHIVED, IN_REVIEW hoặc NEEDS_CORRECTION chặn publish cả nhóm và cần xử lý biên tập riêng; không tự restore/correct bằng checkbox. Một entry thuộc nhiều nhóm có trạng thái toàn cục; UI cảnh báo rõ.

Giới hạn25000mục/thao tác, không truncate hoặc publish subset. Preview fingerprint bám membership/revisions/source rights/hierarchy; mismatch409 buộc xem lại. Source rights có expectedRevision; revoke làm learner predicate fail ngay. Tất cả critical reads/writes qua cùng Prisma tx, import lock8312601 + taxonomy lock8312602, không giữ lock trên một connection rồi dùng client ngoài. Append revision snapshot lấy toàn bộ nghĩa hiện tại, kể cả nghĩa thêm sau import ban đầu; audit gắn authenticated actor/time. Import tiếp tục quarantine đề xuất dưới entry đã reviewed/revision>1.

Ba API additive ADMIN-only, CSRF trên POST, no-store: publication-preview theo category, publication POST theo category và source rights POST. Không đổi Student/Teacher DTO, auth roles, CSRF mechanism, masteries, schema,12migrations hoặc dependencies. Learner endpoints giữ nguyên published+verified+all-source-rights predicate; ADMIN reference view cũng dùng predicate này, management view mới thấy internal data.

Nginx admin-category prefix có timeout150s và giữ body64k; normal API vẫn45s, upload16m chỉ trên hai import routes. Runtime/profile adapter homelab của bản đang chạy không sửa trong feature source này; reuse exact approved adapter khi packaging release sau review, không bypass entrypoint.

## Kết quả kiểm thử cuối

| Gate                                              | Kết quả                                  |
| ------------------------------------------------- | ---------------------------------------- |
| Full API                                          | 829/829,58suites PASS                    |
| Frontend                                          | 93/93,13suites PASS                      |
| Packaging/context                                 | 71/71 PASS                               |
| PostgreSQL/API/browser                            | 26/26steps PASS, final pub-r05           |
| Lint và typecheck                                 | API/Web PASS                             |
| Production build/catalog                          | PASS; PREVIEW_ONLY/default-OFF không đổi |
| Scoped Prettier, secret scan và diff/patch checks | Xem final receipt trong review package   |

Commands: `npm test -w @clp/api -- --runInBand`, `npm test -w @clp/web`, `npm run lint`, `npm run typecheck`, `VITE_API_BASE_URL=/api npm run build`, `node --test deploy/dictionary/packaging.test.cjs deploy/oci01b2/packaging.test.cjs deploy/oci01b2/context.test.cjs`.

Real-stack harness: `DICT_DISPOSABLE_APPROVAL=APPROVED_55441_3116_5206`, `DICT_RUN_ID=pub-r05`, `DICT_SOURCE_FILE=<private Owner HTML path>`, `PLAYWRIGHT_MODULE=<installed module>`, `node deploy/dictionary/disposable.cjs`. Mỗi run dùng cluster17.11 mới hoàn toàn tại127.0.0.1:55441/clp_dict_test, API3116/UI5206. Không resume/reset target cũ. Credentials random runtime-only; owned services dừng trong finally, evidence/data dirs giữ nguyên. Không connect homelab/pilot/clp_dev.

26steps gồm17base regressions và9publication checks: subtree/shared-source gating; inactive ancestor với alternative active memberships; fault injection sau INSERT revisions rồi rollback; concurrent transactions chỉ một commit/không duplicate revision; learner search/detail/category counts và source revoke; real HTTP denied RBAC/CSRF không thay dictionary rows; archived/draft/correction states; oversized25001group refusal; browser desktop1440 và390 mobile chọn nhóm, review, publish và unpublish. Không tạo learning records. Cả hai quyền nguồn và chuyên môn trong test đều là synthetic fixtures, không phải review corpus thật.

Browser dùng HTTP login thực và cookie server trên context synthetic riêng; không nhập password qua form và không phải live HTTPS authenticated UAT. Mobile screenshot sau dữ liệu tải xong, không overflow/pageerrors; chỉ fixture nhóm publication được publish rồi unpublish. 100kheadword fixture dùng cho base search benchmark, **không phải25000published batch performance test**.

Lần build sandbox đầu bị esbuild AccessDenied khi resolve thư mục cha; rerun cùng command/source với quyền phù hợp PASS, không nới ACL/source/env. Không chuẩn hóa format baseline toàn repo. Final scoped-format/scan áp dụng clean exported source, không quét private runtime directories như một false full-root PASS.

Giữ mọi failed/preliminary runs: pub-r01 lỗi Prisma void advisory-lock deserialization, sửa theo existing importer `$executeRaw`; pub-r02 fault-injection harness dùng nhầm template-array.sql, sửa harness; pub-r03 fixture chưa thêm nghĩa thứ hai nhưng assertion đòi2, bổ sung actual alternate import, không yếu assertion; pub-r04 PASS25steps; review tiếp phát hiện cần giữ ARCHIVED/DRAFT/correction states, bổ sung regression; pub-r05 PASS26steps trên source cuối. Không lấy PASS cũ thay evidence cuối.

## Rollout và rollback sau review

Chưa thay API/Web/homelab DB hoặc source corpus thật trong task này; không stage/commit/push/merge. Không migration mới. Source vẫn uncommitted overlay, phải build từ full frozen package+manifest, không chỉ checkout b191d162 hoặc remote main.

Cần paired API/Web acceptance trên Linux AMD64: fresh encrypted backup/restore, đóng gói đúng existing homelab adapter, image context/secret/read-only Nginx checks và synthetic clone publication/unpublication qua proxy mới. Không tự confirm quyền của13nguồn thật hoặc tự publish23266entries. Owner UAT kiểm tra review/source evidence và quyết định nhóm được xuất bản.

Rollback về đúng cặp DICT02–04 API/Web đang chạy, giữ schema12 và mọi content/revision/audit. Bản API cũ vẫn đọc các fields hiện tại, nhưng không có publication controls; **rollback code không tự gỡ nội dung đã publish**. Nếu cần ẩn, Owner gỡ nhóm hoặc thu hồi quyền nguồn bằng app đang có chức năng trước cutover; không sửa trực tiếp DB hoặc xóa history để rollback. Operational restore chỉ theo incident approval riêng.

Residual risks: global editorial namespace serializes import/publication;5editorial/report writes/phút dùng chung; no background/outbox/CMS edit/restore; no multiprocess test (concurrent actual DB transactions/connections đã PASS); max-size valid publish latency chưa benchmark trên homelab; external proxy timeout không chứng minh rollback; discovery/view không realtime; cần refresh/mở lại tra cứu sau thay đổi. Preview LC03B/LC03C và learning evidence không bị ảnh hưởng.
