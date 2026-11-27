# Security và kiểm soát nội dung

## Ranh giới hiện tại

Module dictionary dùng AuthGuard/RoleGuard/CSRF/session hiện có. Không có tài khoản mới trên homelab, role mới, public registration mới, token mechanism mới hoặc quyền global-editor cho TEACHER. Tài khoản synthetic chỉ được tạo trên database disposable.

ADMIN được tra cứu nội bộ và nhập tệp; học viên/giáo viên chỉ đọc khi đồng thời:

1. Entry PUBLISHED và VERIFIED.
2. Có provenance; mọi source đang liên quan tới các senses được phục vụ có rights CONFIRMED.
3. Có category active với toàn bộ ancestor active.

Sources UNKNOWN/DENIED làm reader fail-closed. Quyền không chỉ là UI hiding: predicate dùng chung ở search/detail/category count/report. Catalog revision của learner tính theo dữ liệu nhìn thấy, không lộ thay đổi chỉ xảy ra nội bộ. Direct UUID không bỏ qua quyền. Related/export/notebook chưa triển khai, không có endpoint phụ lộ nội dung.

Corpus thật trên homelab vẫn INTERNAL/UNVERIFIED, rights UNKNOWN. Không tự publish khi import. DB chặn PUBLISHED nếu chưa VERIFIED và source CONFIRMED nếu thiếu rights evidence. DICT07-P bổ sung ADMIN-only source confirmation và publish/unpublish nhóm có CSRF, scope fingerprint, confirmation/review reference và audit. Chỉ người quản trị có căn cứ thực tế được xác nhận; phần mềm/agent không tự chứng nhận specialist sign-off hoặc license. UI phải nêu ảnh hưởng toàn kho của nguồn và ảnh hưởng đa nhóm của mục từ dùng chung. Xem API.md và báo cáo DICT07-P cho giới hạn.

## Giữ nội dung đã được duyệt

Import khóa transaction namespace và các headwords bị tác động. Headword VERIFIED, revision>1 hoặc PUBLISHED không tự nhận nghĩa, nguồn, category hay revision mới. Dòng đề xuất vẫn giữ đầy đủ raw record/source refs trong import item, outcome REVIEW_REQUIRED. Receipt phân biệt canonical source associations và toàn bộ source associations được lưu truy vết.

Không gộp gần nghĩa bằng search-fold; Hán giống mà Pinyin khác giữ headword khác, bản dịch khác giữ sense khác. Search normalization không thay CP05 answer normalization. Những bản dịch tương tự cần chuyên môn xem xét trong DICT07, không tự kết luận synonym hoặc correctness.

Revision/audit append-only có database triggers. Category parent có FK/no-self/cycle/depth8 guard và transaction advisory lock; concurrent moves tạo vòng bị từ chối. FK references vào users/provenance RESTRICT; chính sách account deletion/retention cần review nếu sau này mở chức năng xóa tài khoản.

## Untrusted input

- Quét HTML tuyến tính, chỉ JSON inert theo adapter; không eval/vm/iframe/remote fetch.
- UTF8 strict, file/row/field/category/query/cursor bounds; CSV quotes malformed bị từ chối.
- SQL chỉ bind data parameters. Identifiers trong bulk insert và test fingerprints đến từ allowlist hằng số, không từ request.
- React render text; URL nguồn chỉ HTTPS không chứa credentials, external links dùng noreferrer/noopener.
- Không download toàn corpus vào browser, không nhúng dataset trong frontend/images/Git.
- POST import/report kiểm tra CSRF, roles và explicit operator intent; actor/public IDs không lấy từ request draft.
- Dictionary report write kiểm tra visibility/revision trong cùng INSERT SELECT để tránh check-then-write race.

## Những điều chưa chứng nhận

Không có independent security review của patch này trước Owner review gate. Functional/RBAC/CSRF/rights tests PASS không đồng nghĩa exhaustive pentest. Không kiểm thử native Docker/Nginx hoặc HTTPS dictionary trên homelab; đây là bước acceptance/release riêng. Ordinary UI không hiển thị raw API/Prisma errors; logging/auth policy cũ không được thay đổi trong task.

Dry-run và denied requests không thay dictionary state; session activity refresh vẫn là hành vi AuthGuard kế thừa. Không tuyên bố không có bất cứ thay đổi session metadata nào khi một user xác thực request.
