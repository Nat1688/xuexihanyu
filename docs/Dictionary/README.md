# Từ điển và Tiếng Trung chuyên ngành

Checkpoint: DICT-02–04, 26/11/2026. Trạng thái: source đã triển khai và kiểm thử cô lập; chờ Independent Code Review. **Chưa triển khai lên xuexihanyu.online.**

Đây là module trong cùng React/NestJS/PostgreSQL của XueXiHanyu, không phải website riêng hoặc iframe. Tài khoản hiện có được tái sử dụng. Học viên và giáo viên có mục Từ điển và Tiếng Trung chuyên ngành; ADMIN có thêm Quản lý từ điển để tra cứu nội bộ, kiểm tra/nhập tệp và xem các dòng cần rà soát.

## Có trong lát cắt này

- Migration12 additive: 12 bảng dictionary, provenance, taxonomy, import, revision/audit/report; không sửa 11 migrations cũ.
- Import HTML v4, JSON hoặc CSV qua ADMIN+CSRF; NFC/whitespace normalizer, dry-run, atomic transaction, checksum/version replay, giữ nhiều âm/nghĩa.
- Headword và senses riêng: 32.573 dòng đầu vào thực → 23.266 headwords / 32.563 senses, giữ 33.497 liên kết nguồn.
- Tra Hán/Pinyin/Việt/Anh, bỏ dấu/khoảng trắng khi tìm; xếp hạng, giới hạn/cursor, bộ lọc và taxonomy DB-driven.
- UI tiếng Việt, sao chép, chi tiết/phân trang nghĩa, báo cáo sai sót, desktop/tablet/mobile.
- Publication fail-closed. Mục từ đã hiệu đính không bị bổ sung nghĩa/nguồn mới tự động; dòng mới vào hàng chờ trong hồ sơ nhập.

## Chưa có và không được tuyên bố hoàn tất

DICT05 notebook, DICT06 bộ từ/gắn lesson/assignment/mastery, DICT07 CMS chỉnh sửa/quản lý xuất bản đầy đủ, thư viện biểu mẫu và DICT08 nghiệm thu Linux/triển khai thực. Không có các menu giả cho những phần này. Không có TTS, audio, microphone hoặc AI mới. Flashcards/course/lesson/evidence hiện tại giữ nguyên.

Toàn bộ corpus nguồn còn UNKNOWN về quyền sử dụng và UNVERIFIED về chuyên môn. Chưa có bản ghi corpus thật được xuất bản. Learner tests chỉ dùng nội dung synthetic độc lập; không dùng dữ liệu synthetic để quảng bá nội dung thật đã duyệt.

## Tài liệu

- [Hướng dẫn học viên/giáo viên](USER-GUIDE.md).
- [Hướng dẫn nhập và schema tệp](IMPORT.md).
- [API thực tế và tương thích](API.md).
- [Security và hiệu đính](SECURITY-AND-EDITORIAL.md).
- [Kiểm thử và benchmark](TEST-REPORT.md).
- [Kế hoạch triển khai/backup/rollback homelab](HOMELAB-RELEASE-PLAN.md).
- [Bàn giao và giới hạn](../Review/DICT-02-04-HANDOFF.md).

Thiết kế DICT01 được giữ ở docs/Planning/DICT-01 như hồ sơ đã duyệt. Các điều chỉnh triển khai được ghi rõ trong API/security/handoff, không sửa ngược ZIP thiết kế lịch sử.

## DICT07-P — đang chờ review

Xuất bản/gỡ xuất bản theo toàn bộ nhóm chuyên ngành và xác nhận quyền nguồn ADMIN. Xem [báo cáo DICT07-P](../Review/DICT07-PUBLICATION.md) và [contract API](API.md). Chưa triển khai bản này lên homelab; không tự xuất bản corpus thật.
