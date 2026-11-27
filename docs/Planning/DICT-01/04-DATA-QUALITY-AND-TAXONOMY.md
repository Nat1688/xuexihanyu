# Chất lượng dữ liệu và taxonomy đề xuất

File SHA-256: `519a001dbce642aed261f67fb147a16f33fe6d0fea4ec20a67ad1ca74e2912ed`. Kích thước: 3,735,286 bytes.

## Kết quả thực đếm

| Chỉ số                                          | Giá trị và ý nghĩa                                       |
| ----------------------------------------------- | -------------------------------------------------------- |
| Embedded input rows                             | 32.573                                                   |
| Structurally valid / rejected                   | 32.573 / 0; chưa là linguistic verification              |
| Exact duplicates raw / NFC+trim                 | 0 / 0                                                    |
| Metadata declared original                      | 33.971; file không có những raw rows trước dedup         |
| Historical difference                           | 1.398; không thể xác minh từng original row đã gộp       |
| Source categories / distinct URLs               | 15 / 13                                                  |
| Row-category associations                       | 33.497                                                   |
| Entries nhiều source categories                 | 856                                                      |
| Missing English                                 | 1.176; không fabricate translation                       |
| Missing Chinese/Pinyin/Vietnamese               | 0 / 0 / 0                                                |
| Max Unicode length Hán/Pinyin/English/Việt      | 48 / 162 / 72 / 200                                      |
| Invisible U+200B                                | 16 occurrences trong 16 rows                             |
| Multiple Pinyin per Chinese expression          | 1.904 groups                                             |
| Alternative translations per Chinese+Pinyin     | 5.263 groups, trước proposed cleaning                    |
| Proposed clean duplicate merges                 | 10, nếu duyệt NFC/stripZWSP/BOM/trim/collapse whitespace |
| Candidate senses / headwords sau clean          | 32.563 / 23.266                                          |
| Canonical sense-category associations sau clean | 33.487; giữ toàn bộ raw provenance                       |
| Script elements / external scripts              | 2 / 0; không script nào chạy                             |
| DB import / learner publication                 | 0 / chưa được phép                                       |

Inert JSON cấu trúc cats/sources/counts/entries; mỗi row [Chinese,Pinyin,English,Vietnamese,categoryIndices]. Counts là metadata, không thay thế kiểm đếm. Không cộng category counts để báo unique entry count.

Parser/profile khoảng 0,39 giây trên Windows chỉ là file analysis; không phải benchmark PostgreSQL import/search. Rights UNKNOWN, editorial UNVERIFIED, publication default blocked.

## Mapping nguồn → taxonomy cần review

| #   | Nhãn gốc                    | Metadata count | Thực đếm associations | Product mapping đề xuất                                                           |
| --- | --------------------------- | -------------: | --------------------: | --------------------------------------------------------------------------------- |
| 1   | Công xưởng May mặc          |           2877 |                  2877 | Sản xuất và Công nghiệp → Công xưởng; Dệt may (nguồn kết hợp, cần review)         |
| 2   | Kế toán Kinh doanh          |           5291 |                  5273 | Kế toán và Tài chính → Kế toán kinh doanh                                         |
| 3   | Kế toán Nghiệp vụ           |           3845 |                  3844 | Kế toán và Tài chính → Kế toán nghiệp vụ                                          |
| 4   | Kế toán Nhập khẩu           |           4462 |                  4449 | Kế toán và Tài chính → Kế toán nhập khẩu; Xuất nhập khẩu và Logistics → Nhập khẩu |
| 5   | Kế toán Vận chuyển          |           2646 |                  2646 | Kế toán và Tài chính → Kế toán vận chuyển; Xuất nhập khẩu và Logistics → Vận tải  |
| 6   | Nhân sự Công ty             |           1869 |                  1869 | Nhân sự và Hành chính → Nhân sự công ty                                           |
| 7   | Thương mại Văn phòng        |           2323 |                  2322 | Kinh doanh và Thương mại → Thương mại văn phòng                                   |
| 8   | Thương mại Vận tải          |           2595 |                  2595 | Xuất nhập khẩu và Logistics → Vận tải; Kinh doanh và Thương mại                   |
| 9   | Thương mại Xuất khẩu        |           1960 |                  1959 | Xuất nhập khẩu và Logistics → Xuất khẩu; Kinh doanh và Thương mại                 |
| 10  | Đàm phán Thương mại         |           1781 |                  1781 | Kinh doanh và Thương mại → Đàm phán thương mại                                    |
| 11  | Hải quan                    |           3145 |                  2706 | Xuất nhập khẩu và Logistics → Hải quan                                            |
| 12  | Hợp đồng lao động – Từ vựng |             38 |                    38 | Pháp lý và Hợp đồng → Từ vựng hợp đồng lao động                                   |
| 13  | Hợp đồng lao động – Mẫu câu |            492 |                   491 | Pháp lý và Hợp đồng → Mẫu câu hợp đồng lao động                                   |
| 14  | Công sở Văn phòng – Từ vựng |            512 |                   512 | Nhân sự và Hành chính → Công sở – Văn phòng                                       |
| 15  | Công sở Văn phòng – Mẫu câu |            135 |                   135 | Nhân sự và Hành chính → Mẫu câu giao tiếp công sở                                 |

Giữ nguyên cả 15 nhãn/index/URL trong source provenance. Taxonomy sản phẩm riêng có sáu roots:

- Sản xuất và Công nghiệp — 生产与工业.
- Kinh doanh và Thương mại — 商务与贸易.
- Kế toán và Tài chính — 会计与财务.
- Xuất nhập khẩu và Logistics — 进出口与物流.
- Nhân sự và Hành chính — 人力资源与行政.
- Pháp lý và Hợp đồng — 法律与合同.

Chinese root labels do Owner cung cấp. Child chưa có Chinese label không được tự tạo như đã hiệu đính. Future cơ khí/điện tử/Logistics tổng quát không hiển thị như tài nguyên đã có. Mapping theo nguồn là gợi ý broad-field, không khẳng định mọi term cùng chuyên ngành; giữ review flag cho ambiguous associations.

## Content types và quality flags

WORD/TERM/PHRASE không thể xác định chắc bằng độ dài. Default UNCLASSIFIED. Nhãn nguồn Mẫu câu là evidence gợi ý SENTENCE nhưng vẫn UNVERIFIED; conflict giữa nhiều nguồn → TYPE_REVIEW. Không dựng hợp đồng/tài liệu hoàn chỉnh. Không có example field độc lập; không gán sentence row làm example của headword bằng heuristic.

Flags đề xuất: MISSING_ENGLISH, INVISIBLE_REMOVED, AMBIGUOUS_TYPE, ALTERNATIVE_TRANSLATION, ALTERNATIVE_PINYIN, NEEDS_LINGUISTIC_REVIEW. Không tự gắn incorrect/synonym khi chưa chuyên môn. Reconciliation tách raw rows/headwords/senses/source associations; không discard thiếu nghĩa Anh.

Raw data không được đổi bởi audit. Experiment canonicalization lưu riêng, chưa được áp dụng vào application hoặc DB.
