# Dictionary API thực tế

Tất cả route bên dưới nằm trong API monolith. Khi đi qua reverse proxy, thêm `/api` phía trước; frontend dùng public API base hiện có, không host cố định. Các endpoint này additive, không sửa DTO Student/Teacher/Content cũ.

## Routes

| Method | Path                              | Quyền và chức năng                                                     |
| ------ | --------------------------------- | ---------------------------------------------------------------------- |
| GET    | /dictionary/entries               | ADMIN/TEACHER/STUDENT; chỉ dữ liệu published/verified/rights-confirmed |
| GET    | /dictionary/entries/:id           | cùng predicate; nguồn và nghĩa, tối đa50nghĩa/lần                      |
| GET    | /dictionary/categories            | hierarchy và DISTINCT visible counts, chỉ nhánh có nội dung            |
| POST   | /dictionary/entries/:id/reports   | cùng quyền xem + CSRF; revision và comment≤2000                        |
| GET    | /dictionary/admin/overview        | ADMIN; thống kê nội bộ                                                 |
| GET    | /dictionary/admin/entries         | ADMIN; tra cứu gồm nội dung chưa công bố                               |
| GET    | /dictionary/admin/entries/:id     | ADMIN; chi tiết nội bộ                                                 |
| GET    | /dictionary/admin/categories      | ADMIN; nhóm có nội dung nội bộ                                         |
| GET    | /dictionary/admin/imports/:id     | ADMIN; receipt/summary và trang issues                                 |
| POST   | /dictionary/admin/imports/dry-run | ADMIN+CSRF; kiểm tra tệp, không ghi dictionary                         |
| POST   | /dictionary/admin/imports         | ADMIN+CSRF+explicit confirmation; atomic import                        |

DICT07-P bổ sung ba route ADMIN bên dưới; không thêm edit/move-category hoặc full CMS. Category detail vẫn dùng hierarchy và search filter.

## Xuất bản cả nhóm — DICT07-P

- `GET /dictionary/admin/categories/:id/publication-preview`: gồm descendants, trả `category,fingerprint,total,published,unverified,sharedEntries,sources,blockers,maxGroupSize`. Chỉ ADMIN; evidence quyền nguồn không xuất hiện trong learner DTO. GET không ghi dictionary; AuthGuard vẫn có thể refresh session activity.
- `POST /dictionary/admin/categories/:id/publication`: ADMIN+CSRF, `{fingerprint,action:PUBLISH|UNPUBLISH,confirmed:true,contentReviewed,reviewReference}`. Publish cần `contentReviewed:true` và reference20–2000ký tự, mọi nguồn CONFIRMED+có evidence, active ancestry, meanings/provenance đầy đủ. Unpublish không đòi xác nhận hiệu đính hoặc quyền nguồn; không xóa verification/history. Trả `{action,total,changed,publication}`. Max25000, không silently truncate hoặc publish subset. Các nhóm có mục dùng chung chịu ảnh hưởng toàn cục.
- `POST /dictionary/admin/sources/:id/rights`: ADMIN+CSRF, `{expectedRevision,rights:CONFIRMED|UNKNOWN|DENIED,evidence,confirmed:true}`. Evidence20–2000ký tự, actor/time server-owned; transaction+append audit. Thu hồi làm learner predicate fail-closed ngay; source dùng chung toàn kho.

Fingerprint là optimistic-concurrency digest, không phải authentication token. Server tự tính lại membership/revisions/source rights/category hierarchy trong transaction; stale409 buộc preview lại. Một transaction dùng chung import lock8312601 và taxonomy lock8312602; tất cả reads/writes qua tx. Không giữ một connection rồi viết bằng client ngoài transaction. Mỗi entry thay đổi có revision snapshot hiện tại đầy đủ và audit nhóm, lỗi rollback toàn bộ. Không có learning writes hoặc migration.

Mục ARCHIVED hoặc đang IN_REVIEW/NEEDS_CORRECTION làm publish cả nhóm bị chặn, cần xử lý biên tập riêng. Unpublish chỉ đổi các mục PUBLISHED sang INTERNAL, không biến DRAFT/ARCHIVED thành nội dung đang hoạt động và không hạ verification đã có.

Mỗi ADMIN có cùng budget5 editorial/report writes/phút hiện hữu. Chờ khi429; không tự retry mutation. Nếu network/proxy ngắt sau commit, preview lại để xem trạng thái, không coi timeout là rollback. Hai request cùng fingerprint: một commit, request còn lại stale409; cùng trạng thái với fingerprint mới trả changed0.

Body64k; Nginx admin-category prefix giữ cap64k và timeout150s cho nhóm, ordinary API vẫn45s. Native image/proxy smoke của revision này chưa chạy; cần separate rollout acceptance.

## Search và pagination

`q` tối đa120Unicode code points; `limit`1–50, default20; `sort` = relevance/pinyin/chinese. `categoryId` publicUUID, `includeDescendants` true/false defaulttrue; `type` trong WORD/TERM/PHRASE/SENTENCE/UNCLASSIFIED; cursor bounded2000chars. Unknown keys/array query/invalid IDs bị400.

Response: `{items,total,nextCursor,catalogRevision}`. Identity Hán/Pinyin giữ nguyên; Pinyin tone/spaces và Việt accent/đ folding chỉ để tìm. Ü/v có khóa chính, u alias hạng thấp; không dùng alias để gộp hoặc chấm bài.

Rank: exactHán → exactPinyin → exactnghĩa → prefix → partial, UUID tie-break. Keyset cursor bind query/filter/version; mismatch409. Learner catalog revision chỉ tính dữ liệu được phép xem; internal-only import không lộ hoạt động qua revision. Không hứa stable snapshot qua content changes; cần refresh.

Mỗi result trả tối đa10senses và `senseCount`; detail trả tối đa50, `nextSenseCursor`. Gửi `senseAfter=<publicUUID>` để lấy trang nghĩa tiếp theo. UI giữ revision đang đọc khi nối các trang. Không cắt mất dữ liệu lưu trong database. Các response chỉ có public UUID, không persistence IDs.

## Upload

Content-Type `application/octet-stream`; `X-Dictionary-Format` html/json/csv; `X-Dictionary-Filename` basename percent-encoded; write-mode thêm `X-Dictionary-Confirm: IMPORT_INTERNAL_UNVERIFIED`. Đây là xác nhận thao tác, không thay authentication/CSRF. Password/token không được đưa trong URL/command arguments/logs.

Reuse session CSRF cookie + X-CSRF-Token + session-bound hash. File≤16MiB, request length bắt buộc và stream vẫn đếm bytes. Default body limits của auth/content không bị tăng; Nginx chỉ nới đúng hai import routes lên16m/150s. CORS chỉ mở thêm tên ba header này trên SPA_ORIGIN đã cấu hình, không thêm origin.

Receipt nêu input/valid/rejected/duplicates/candidates/matched/inserted/pending/source counts/checksum/batchID/replay. Hàng chờ: `afterOrdinal`0–100000, trang20, `nextIssueOrdinal`; ADMIN mới thấy raw issue rows. `dryRun` công bố `dictionaryWrites:0`, không giả rằng AuthGuard không refresh session metadata.

## Security/error contract

AuthGuard → RoleGuard; explicit class roles, ADMIN override chỉ cho admin routes. Mọi mutation cần CSRF trước service/write. GET/reference không ghi learning data hoặc dictionary; AuthGuard session activity là hành vi kế thừa. `Cache-Control:no-store` trên mọi response của controller, gồm lỗi DictionaryError.

400 invalid,401 unauthenticated,403 forbidden/CSRF,404 restricted/missing entries/batch,409 stale cursor/revision or unavailable report target,413 size,429budget; unexpected errors giữ500generic. `{error:{code,message}}`; UI map tiếng Việt, không hiển thị SQL/Prisma/raw server message. Read budget120/account/min, report5, import/dry-run2; bounded5000budget keys.
