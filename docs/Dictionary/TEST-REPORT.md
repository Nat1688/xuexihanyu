# Báo cáo kiểm thử DICT02–04

Ngày26/11/2026. Source b191d162 + frozen UI06 + dictionary changes, trong worktree riêng. Không phải báo cáo nghiệm thu production.

## Quality gates đã thực thi

| Gate                               | Kết quả                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| API regression                     | 810/810,57suites PASS                                                                               |
| Frontend regression                | 90/90,12suites PASS                                                                                 |
| Targeted dictionary/API auth tests | 32/32 PASS, nằm trong810API                                                                         |
| Packaging/context tests            | 70/70 PASS, bao gồm3dictionary-specific tests                                                       |
| Lint / typecheck                   | API và Web PASS                                                                                     |
| API/Web production build           | PASS; catalog PREVIEW_ONLY/default-OFF unchanged                                                    |
| Prisma validate                    | PASS                                                                                                |
| Isolated Prisma generate           | Windows Client6.19.3,31models/12dictionary models PASS; output riêng, không ghi shared node_modules |
| Scoped format / diff               | kiểm tra đúng changed files, ghi receipt cuối cùng trong review package                             |
| Source secret scan                 | clean frozen export; xem receipt cuối cùng, không đồng nhất với root runtime-artifact scan          |

Prisma generate output báo EPERM khi tìm ancestor .env ngoài worktree nhưng vẫn exit0 và generate thành công; không cấp quyền đọc .env để bỏ qua cảnh báo. Không có Linux-native generate/image acceptance trong lần này.

## Acceptance PostgreSQL/API/browser thực tế

Run cuối: dict02-r06. 17/17 bước PASS. PostgreSQL17.11 riêng tại127.0.0.1:55441/clp_dict_test; API3116/UI5206loopback. Chỉ credentials random lúc chạy. Test cluster tạo mới, xác minh identity/data_directory/empty schema trước migration; dừng đúng cluster owned khi xong, giữ data/evidence. Không dùng homelab/pilot/clp_dev.

- PASS — approved new PostgreSQL17 identity and empty schema (54 ms).
- PASS — eleven baseline migrations on a new empty PostgreSQL17 (1522 ms).
- PASS — additive migration12 preserves populated identity/credential/role/session and all19 prior tables (1406 ms).
- PASS — actual corpus parse and canonical reconciliation (0 ms).
- PASS — real corpus atomic import and retained provenance (13236 ms).
- PASS — repeat and competing imports replay without duplicates (34 ms).
- PASS — injected canonical and provenance failure roll back all tables (93 ms).
- PASS — dictionary history constraints and concurrent taxonomy cycle rejection (16 ms).
- PASS — internal actual-data search, alternatives, paginated taxonomy and publication gate (533 ms).
- PASS — combined category/type filters and normalized Pinyin ordering across cursor pages (212 ms).
- PASS — new imports cannot append unreviewed meanings/sources to reviewed published content (293 ms).
- PASS — real HTTP authentication/RBAC/CSRF and unchanged denied-request DB state (178 ms).
- PASS — real HTTP multilingual search, literal input, rights revocation and idempotent file upload (806 ms).
- PASS — real dataset five-client search benchmark and actual planner evidence (1343 ms).
- PASS — real API/browser dictionary at desktop/tablet/mobile, roles and import notices (5253 ms).
- PASS — 100000-headword synthetic scale fixture benchmark, separate from real corpus (11551 ms).
- PASS — dictionary never creates learning records (1 ms).

Rehearsal nâng11→12 có users/credentials/roles/session synthetic đã tồn tại, so rowcounts+ordered row-content MD5 của19business tables; không thay11migration cũ. Các bảng khác trống trong fixture, không giả dữ liệu người dùng thật. Ledger12 và12bảng mới được xác minh.

Browser dùng API/NestJS/PostgreSQL thật, không mock endpoint. Login thực bằng HTTP với account synthetic, browser nhận chính session cookie từ server; đây không phải test nhập mật khẩu qua login form. ADMIN/Student mở UI, tra cứu, chi tiết/quay lại, viewport1440/768/390, không overflow/runtime error. Teacher RBAC xác minh qua HTTP và UI unit/fixture regression. Screenshots không chụp credentials.

Corpus thật chỉ ADMIN nội bộ; đúng1synthetic headword độc lập được đánh dấu rights-confirmed/verified/published để kiểm tra learner. Revocation làm search/detail/category fail-closed. Chưa xuất bản bất cứ corpus thật nào. Không có exercise session/submission/event/mastery writes do dictionary.

## Dataset reconciliation

| Chỉ số                              |                            Thực đếm/lưu |
| ----------------------------------- | --------------------------------------: |
| Input rows                          |                                   32573 |
| Valid / rejected structure          |                                32573 /0 |
| Exact raw duplicates                |                                       0 |
| Extra canonical duplicate merges    |                                      10 |
| Inserted headwords                  |                                   23266 |
| Inserted senses                     |                                   32563 |
| Source records / source categories  |                                  13 /15 |
| Retained row/source associations    |                                   33497 |
| Missing English raw rows            |                                    1176 |
| Normalized raw rows                 |                                      16 |
| Original count declared in metadata | 33971, chưa có raw33971rows để xác minh |

Không đồng nhất headwords/senses/raw rows/category counts. Số sau đây ở benchmark có thêm1synthetic learner fixture so với corpus. Các imports chờ rà soát giữ raw row + source refs, không chèn nghĩa mới dưới headword đã VERIFIED.

## Benchmark đã đo

| Dataset                                                      | Concurrent clients / queries | p50 /p95 /p99 ms |  DB bytes | Read-worker RSS cuối |
| ------------------------------------------------------------ | ---------------------------- | ---------------- | --------: | -------------------: |
| Corpus thực +1synthetic headword (23267 heads/32564 senses)  | 5 /50                        | 35 /103 /114     | 126351027 |       81055744 bytes |
| 100000headwords tổng, thêm fixture synthetic (109297 senses) | 5 /50                        | 48 /212 /220     | 232068787 |       81915904 bytes |

Nhập corpus lần đầu: 13236ms trong run cuối. Đây là Windows17.11 local, không phải thời gian homelab i3.

Đây là50queries/10terms,5clients trong worker riêng, search ADMIN/internal. Không phải cold-cache/full-load test, không phải100000published learner entries, không phải RSS peak của toàn NestJS/import hoặc PostgreSQL. Benchmark sau scale có synthetic rows không có quyền phát hành, không được tính như dữ liệu học thật.

EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) lưu cho predicate Việt contains. Planner chọn Seq Scan ở corpus nhỏ, Bitmap Heap Scan/index ở100k. Không ép enable_seqscan=false và không tuyên bố toàn compound query luôn dùngGIN. Thêm version-index tránh mỗi request scan toàn bảng chỉ để lấymax timestamp; preliminary r03p95402ms được giữ, run cuối đạt target nội bộ<300ms.

## Evidence kế thừa/không chạy lại

-37fixture browser scenarios của Student dashboard/exit/recovery, Teacher, Ink UI, flashcards và written recall đã chạy trong branch sau tích hợp navigation. Các sửa cuối chỉ nằm dictionary/query/error-report semantics; evidence gốc được giữ, không giả là authenticated homelab tests.
-Không rerun toàn bộ older CP05/CL01/admissions PG integration suites trên targets riêng của chúng. Full default API suite PASS và dictionary rehearsal dùng schema12; các gate khác là inherited evidence, không full PostgreSQL regression claim.
-Không Docker/Nginx runtime/HTTPS dictionary build trên Linux, live backup restore/schema12 clone hoặc Owner UAT trên xuexihanyu.online. Không production deploy/migration/import.

## Lệnh tái hiện

```powershell
npm test -w @clp/api -- --runInBand
npm test -w @clp/web
npm run lint
npm run typecheck
$env:VITE_API_BASE_URL='/api'; npm run build
node --test deploy/dictionary/packaging.test.cjs deploy/oci01b2/packaging.test.cjs deploy/oci01b2/context.test.cjs
$env:DICT_DISPOSABLE_APPROVAL='APPROVED_55441_3116_5206'
$env:DICT_RUN_ID='<NEW-RUN-ID>'
$env:DICT_SOURCE_FILE='<private-path-to-Owner-HTML>'
$env:PLAYWRIGHT_MODULE='<installed-playwright-module-path>'
node deploy/dictionary/disposable.cjs
```

Harness chỉ Windows PG17.11 đã cài; refuse directory/ports tồn tại, không resume/reset. Không dùng các lệnh này trên Linux hoặc thay target sang homelab. HTTP test dùng CORS loopback, production dự kiến single-origin /api. No passwords in arguments/logs.

Bảo toàn r01harness stdout-null failure đã sửa và dừng owned cluster riêng; r02/r03/r04/r05 đều giữ nguyên. Không dùng kết quả cũ để thay source-specific final r06 receipt.
