# DICT — Feature specification đề xuất

## Slice đầu tiên và navigation

DICT02–04: foundation/import/governance, search/detail, taxonomy/chuyên ngành. Student/Teacher shell có Từ điển và Tiếng Trung chuyên ngành; ADMIN có Quản lý từ điển. Không thêm menu Sổ tay từ vựng hoặc Thư viện biểu mẫu khi chưa có chức năng sử dụng được. DICT05–07 mở sau theo dependencies. Không hiển thị phần chưa làm như tính năng hoàn tất.

## Quyền

| Actor            | Quyền đề xuất                                                                           |
| ---------------- | --------------------------------------------------------------------------------------- |
| Anonymous        | Không dictionary API, content/counts hoặc notebook                                      |
| STUDENT/TEACHER  | Đọc PUBLISHED + VERIFIED + rights CONFIRMED; nguồn còn cho phép                         |
| ADMIN            | Review internal, import/dry-run, editorial/revisions/category/source, xuất bản có audit |
| TEACHER          | Chọn từ được phép và đề xuất sửa; không global edit/publish                             |
| Chủ notebook/set | Chỉ tài nguyên của mình; ADMIN không mặc nhiên đọc private notes                        |

Không thêm EDITOR role vào enum hiện tại. Editor không phải ADMIN cần permission task riêng. Nội dung HTML v4 mặc định UNVERIFIED, DRAFT/INTERNAL, rights UNKNOWN; không tự xuất bản cho học viên. Learner tests dùng synthetic content có quyền kiểm thử, không gắn nhãn corpus thật đã duyệt. Rights gate áp dụng đồng nhất ở search/detail/category counts/related/export, không chỉ ẩn nút.

## Tra cứu và chi tiết

- Chữ Hán; Pinyin có/không dấu, khoảng trắng; Việt có/không dấu; English.
- Query1–120 Unicode code points, page mặc định20/tối đa50; debounce300ms, cancel stale response.
- Ranking exact Hán → exact Pinyin → exact nghĩa → prefix → substring; deterministic UUID tie-break; approximate search deferred tới benchmark.
- Filter chuyên ngành/descendants/type; sort relevance/Pinyin/Hán; đổi query/filter reset cursor.
- Không full-dataset download hoặc bundle. Result: Hán/Pinyin/Việt/Anh khi có, type/category, copy/details; notebook actions chỉ xuất hiện khi DICT05 hoàn tất.
- Detail giữ alternate senses và provenance; không bịa synonyms/examples. Render plain text bằng React escaping, không trusted HTML.
- Missing English không tạo vùng trống; lỗi/empty/loading/retry tiếng Việt, không lộ Prisma/internal IDs.

## Chuyên ngành

Taxonomy DB-driven, nguồn15nhóm độc lập product hierarchy. Một entry nhiều categories; parent counts DISTINCT entry, không cộng count con gây double count. Count UNCLASSIFIED riêng; không gọi tất cả là từ vựng/mẫu câu. Chỉ advertise nhánh có nội dung người dùng được phép đọc. Không dựng hợp đồng hoàn chỉnh từ sentence rows.

## Notebook và teaching sau slice đầu

DICT05: entry references, personal notes/collections/familiarity và review history theo ownership DB. Không localStorage-only. Familiarity không đổi mastery. Khi entry bị unpublish, không lộ stale dictionary snapshot trong notebook/export; hiển thị mục không còn khả dụng, xử lý ghi chú riêng theo owner policy.

DICT06: teacher-owned sets chọn sense/revision; attach lesson qua existing content application service, materialize frozen LearningItem và provenance link. Từ điển sửa sau không đổi answer keys/session snapshots đã giao. Assignment/course admission/ownership hiện tại tiếp tục quyết định quyền học. Bộ từ không tự là assignment/completion; dictionary reference GET không ghi evidence. Không dựng learning engine thứ hai.

## UI/Accessibility

Mọi label/filter/tooltip/aria/validation/error/import report bằng tiếng Việt. English chỉ là dictionary/lesson content; không fallback UI. Giữ HTML vi và uiLocale/instructionLanguage độc lập. Responsive1440/768/390×844, keyboard focus, status live region, câu dài wrap. Theme hiện light canonical; không tự triển khai dark theme. Không có audio controls, TTS, microphone, listening hoặc AI.
