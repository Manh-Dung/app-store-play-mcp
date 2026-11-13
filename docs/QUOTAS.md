# STORE QUOTAS, POLICIES & LIMITS

Tài liệu tham chiếu các giới hạn hạn mức (Rate Limits), quy định dữ liệu và chính sách an toàn của Google Play Console và Apple App Store Connect.

---

## 1. Google Play Console (Android Publisher API v3)

### A. Hạn mức API (Quotas)
- **Mặc định dự án**: 200.000 requests/ngày cho mỗi Google Cloud Project. Có thể xin nâng hạn mức trên Google Cloud Console nếu cần xử lý lượng request lớn.
- **Tần suất yêu cầu**: Google áp dụng thuật toán token-bucket theo từng phút; nếu gọi dồn dập có thể nhận lỗi `429 Too Many Requests` hoặc `503 Backend Error`.

### B. Vòng đời Edit Session (`edits`)
- **Giới hạn phiên**: Mỗi app (`packageName`) chỉ được phép mở duy nhất **1 phiên edit chưa commit** tại một thời điểm. Mở phiên mới khi phiên cũ chưa đóng sẽ khiến phiên cũ bị mất hiệu lực hoặc gây lỗi xung đột.
- **Thời gian hết hạn**: Phiên edit hết hạn sau một khoảng thời gian (thường từ vài giờ đến vài ngày).
- **Quy tắc dọn dẹp**: Mọi tool composite (`deploy_app`, `create_release`, `promote_release`, `aso_audit_app`) đều tự động dọn sạch edit session (`edits.delete`) ngay cả khi xảy ra lỗi.

### C. Giới hạn Rollout giai đoạn (Staged Rollout)
- `userFraction` phải nằm trong khoảng: `0.0001 <= userFraction <= 1.0` (tương đương 0.01% đến 100%).
- **Quy tắc một chiều**: Không thể giảm tỉ lệ rollout xuống thấp hơn giá trị đang chạy (ví dụ từ 50% xuống 20%). Nếu phát hiện bản build có lỗi, bắt buộc phải dùng `halt_rollout` để dừng khẩn cấp.

### D. Giới hạn đánh giá & Trả lời Review
- Google chỉ trả về các bài đánh giá có nội dung văn bản trong vòng **7 ngày gần nhất**.
- Độ dài tối đa của câu trả lời từ nhà phát triển: **350 ký tự**.
- Hạn mức gọi review: ~200 requests/giờ.

### E. Giới hạn ký tự Metadata Google Play
- **Tiêu đề app (Title)**: Tối đa 30 ký tự.
- **Mô tả ngắn (Short Description)**: Tối đa 80 ký tự.
- **Mô tả đầy đủ (Full Description)**: Tối đa 4000 ký tự.
- **Ảnh chụp màn hình**: Tối thiểu 2 ảnh, tối đa 8 ảnh cho mỗi loại thiết bị (Phone, 7-inch tablet, 10-inch tablet).

---

## 2. Apple App Store Connect API

### A. Hạn mức gọi API (Rate Limits)
- **Hạn mức tài khoản**: Tối đa **3.600 requests/giờ** cho mỗi API Key.
- Khi vượt ngưỡng, API trả về HTTP `429 Too Many Requests` kèm header `Retry-After`. Client HTTP của hệ thống (`undici` trong `appstore-operate`) tự động retry theo cơ chế exponential backoff.

### B. Thời hạn Token & Bảo mật JWT
- Token xác thực JWT được ký bằng thuật toán **ES256** từ file khóa `.p8`.
- **Thời hạn tối đa**: 20 phút theo chuẩn bảo mật của Apple. Hệ thống tự động làm mới (refresh) token trong bộ nhớ đệm trước khi hết hạn.

### C. Đánh giá & Phản hồi Khách hàng (Customer Reviews)
- Khác với Google, Apple cho phép xem lại lịch sử review lâu hơn và lọc theo trạng thái đã trả lời / chưa trả lời.
- Độ dài tối đa của phản hồi nhà phát triển: **5.970 ký tự**.

### D. Giới hạn ký tự Metadata App Store
- **Tên ứng dụng (App Name)**: Tối đa 30 ký tự.
- **Phụ đề (Subtitle)**: Tối đa 30 ký tự.
- **Từ khóa tìm kiếm (Keywords)**: Tối đa 100 ký tự (các từ khóa phân cách bởi dấu phẩy, không chứa khoảng trắng thừa).
- **Văn bản quảng cáo (Promotional Text)**: Tối đa 170 ký tự (có thể thay đổi mà không cần nộp bản build mới).
- **Mô tả chi tiết (Description)**: Tối đa 4000 ký tự.

---

## 3. Chính sách An toàn & Thao tác Phá hoại (Safety Layer)

1. **Chế độ Read-Only (`--read-only` hoặc `STORE_MCP_READ_ONLY=1`)**:
   - Chặn tuyệt đối mọi lệnh tạo, sửa, xóa, nộp duyệt ở cấp độ server.
2. **Cổng kiểm soát phá hoại (`destructiveGate`)**:
   - Các hành động mang tính hủy hoại dữ liệu (xóa listing, xóa in-app purchase, dừng khẩn cấp rollout) bị từ chối trừ khi:
     - Biến môi trường `STORE_MCP_ALLOW_DESTRUCTIVE=1` được bật, HOẶC
     - Truyền cờ `{ "confirm": true }` trong tham số gọi tool, HOẶC
     - Truyền mã xác thực hợp lệ `{ "confirmationId": "CONF-XXXXXXXX" }`.
3. **Mã xác thực 2 bước (Two-Phase Confirmation Token)**:
   - Sinh token ngẫu nhiên 8 ký tự với tiền tố `CONF-`.
   - Băm payload tham số để đảm bảo không bị tráo đổi payload khi xác nhận.
   - Hạn dùng chính xác **10 phút** và chỉ có giá trị sử dụng **1 lần duy nhất** (`single-use`).
4. **Bảo mật Secret & Dữ liệu nhạy cảm**:
   - Tự động thanh lọc (redact) private key PEM, JWT token, Bearer header trong mọi chuỗi phản hồi trả về client.

