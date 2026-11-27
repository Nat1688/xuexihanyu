# Hướng dẫn nhập dữ liệu từ điển

## Quyền và an toàn

Chỉ ADMIN được nhập hoặc kiểm tra tệp. TEACHER không có quyền sửa kho từ chung. Nhập dữ liệu cần phiên hợp lệ, CSRF và xác nhận riêng **chỉ nhập nội bộ, chưa hiệu đính và chưa xuất bản**. Không dùng demo seed, M06 provisioning hoặc bỏ qua guard để nhập corpus.

Giới hạn: UTF-8, không quá 16 MiB, tối đa 100.000 dòng, tối đa 1.000 nhóm nguồn trong một tệp; toàn taxonomy tối đa 1.000 node và depth8. Một dòng JSON không quá64.000bytes; Hán≤2.000/Pinyin≤4.000/nghĩa≤8.000 Unicode code points. Vượt giới hạn không bị cắt mất nội dung âm thầm. Không thực thi JavaScript, tải URL nguồn hoặc nhập quảng cáo/HTML trình bày.

## Thao tác quản trị

1. Chọn **Quản lý từ điển → Nhập dữ liệu từ điển**.
2. Chọn HTML, JSON hoặc CSV; không đưa mật khẩu hoặc dữ liệu riêng tư vào tệp.
3. Chọn **Kiểm tra tệp, không ghi dữ liệu**. Đọc số dòng hợp lệ, thiếu trường, trùng và thống kê theo nguồn.
4. Nếu phù hợp, đánh dấu xác nhận nội bộ rồi chọn **Nhập dữ liệu nội bộ**.
5. Giữ trang mở khi xử lý. Nếu kết nối bị ngắt, nhập lại cùng tệp sẽ nhận receipt của lần đã hoàn thành, không nhân đôi dữ liệu. Sau hai lần kiểm tra/nhập trong một phút, chờ để tránh giới hạn tần suất.
6. **Xem các dòng cần kiểm tra** và **Xem thêm dòng cần kiểm tra** đọc hàng chờ theo từng trang20dòng. Dòng liên quan mục từ đã được hiệu đính chưa tự áp dụng; CMS duyệt/chỉnh sửa đầy đủ là DICT07.

Dry-run không ghi bảng dictionary/import/audit. Cơ chế AuthGuard hiện hữu vẫn có thể cập nhật `sessions.last_used_at` khi xác thực. Vì vậy API công bố `dictionaryWrites:0` và `sessionActivityMayRefresh:true`, không tuyên bố toàn database tuyệt đối không ghi. Không đổi auth contract để che khác biệt này.

## HTML v4

Adapter đọc đúng một `<script id="data" type="application/json">…</script>` với thuộc tính có dấu ngoặc. Không dùng `eval`, DOM thực thi, iframe hoặc chạy các script khác. Quét thẻ theo thứ tự tuyến tính, từ chối thẻ chưa đóng hoặc nhiều khối dữ liệu trùng ID.

## JSON

```json
{
  "cats": ["Nguồn kiểm thử"],
  "sources": ["https://example.invalid/source"],
  "counts": [1],
  "entries": [["示例", "shìlì", "example", "ví dụ", [0]]]
}
```

Ví dụ synthetic để mô tả schema, không phải curriculum đã xuất bản. Mỗi dòng giữ thứ tự **Hán, Pinyin, Anh, Việt, danh sách chỉ số nhóm nguồn**. `counts` không bắt buộc; nếu có phải đúng độ dài/số nguyên không âm. Đây là số khai báo, không thay thế kiểm đếm dòng thật.

## CSV

Header phải đúng thứ tự:

```csv
chinese,pinyin,english,vietnamese,category,sourceUrl
示例,shìlì,example,ví dụ,Nguồn kiểm thử,https://example.invalid/source
```

Hỗ trợ trường có dấu phẩy/xuống dòng trong ngoặc kép và escape ngoặc bằng hai dấu ngoặc. Cấu trúc quote hỏng bị từ chối. Mỗi dòng CSV có một nguồn/nhóm; cùng nội dung ở nhiều dòng sẽ được gộp theo identity đồng thời giữ nguồn tương ứng. Muốn gán nhiều nhóm trong cùng dòng thì dùng JSON.

URL nguồn phải là HTTPS, không username/password; URL chỉ được lưu, không được server tải về. Không đoán bổ sung nghĩa Anh/Pinyin/ví dụ còn thiếu.

## Normalization, dedup và recovery

Raw record và nhãn/URL nguồn của từng dòng nằm trong `dictionary_import_items.raw`, kèm số dòng, checksum, filename và parser/normalizer versions. NFC, bỏ U+200B/U+FEFF và làm gọn khoảng trắng áp dụng cho canonical text; search keys khác identity. Không gộp chỉ theo chữ Hán, Pinyin đã bỏ dấu hoặc nghĩa gần giống.

Import dùng một transaction cho batch/canonical/provenance/taxonomy/audit, bulk500rows/chunk và database transaction lock. Lỗi giữa chừng rollback toàn transaction; retry từ đầu an toàn. Đây là điều chỉnh nhỏ so với thiết kế hai pha: trong giới hạn file hiện tại, không có staging commit riêng hoặc background job. Lần thất bại chưa commit không xuất hiện như batch thành công; giữ evidence ở công cụ kiểm thử, không bịa lịch sử nhập đã commit.

Mục từ đã VERIFIED, có revision>1 hoặc PUBLISHED được khóa bảo vệ: dòng nhập mới không tự thêm nghĩa/nguồn/category/revision vào đó. Dữ liệu mới vẫn giữ trong import-item với `REVIEW_REQUIRED` và raw nguồn đầy đủ, chờ người có quyền rà soát. Điều này ngăn nội dung chưa duyệt xuất hiện dưới trạng thái của mục từ đã duyệt.

Định dạng/version parser cố định trong code; taxonomy và dữ liệu tương lai không cần sửa frontend hoặc tạo bảng theo từng ngành. Adapter mới hoặc normalizer mới phải có version/tests/review trước áp dụng.
