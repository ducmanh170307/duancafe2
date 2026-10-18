# Giới hạn triển khai và checklist Production

Repository được thiết kế cho **đồ án Công nghệ phần mềm, chạy demo nội bộ**. Dưới đây là ranh giới giữa nghiệp vụ chạy bằng MySQL và những thứ **chưa tích hợp thật**.

| Hạng mục | Trạng thái hiện tại | Việc cần làm để đưa vào production |
|---|---|---|
| Tiền mặt | Thu ngân xác nhận trực tiếp, có audit/chốt ca | Quy trình kép, đối soát kế toán |
| QR/VietQR/ví/thẻ | Chỉ `DEMO` (không có giao dịch thực) | Tích hợp provider, webhook ký số, idempotency key, hoàn tiền bất đồng bộ |
| Thu nhiều phương thức | Nhiều lần thu CASH/DEMO tới đủ | Gateway adapter + kiểm soát partial/refund an toàn |
| Hóa đơn | Phiếu bán hàng nội bộ in trình duyệt | Đơn vị hóa đơn điện tử hợp pháp, ký/gửi hóa đơn VAT, tra cứu |
| Thông báo | Trạng thái qua polling KDS 7s & tra cứu | Push notification, email, SMS/Zalo qua provider + queue/outbox |
| GPS | Khoảng cách tới tọa độ chi nhánh <=250m | Chống giả mạo GPS, xác minh thiết bị, consent |
| QR chấm công | Token JWT 2 phút dạng chuỗi nhập tay | QR render camera + chống replay (nonce), kiểm thiết bị |
| Wi-Fi/vân tay | Chưa có | Integrate thiết bị/bộ đọc, lưu dữ liệu sinh trắc đúng quy định |
| POS offline | Chưa có | IndexedDB local ledger, sync idempotent, conflict resolution |
| Lịch đổi ca | Yêu cầu có thể tạo, không tự thay người khi duyệt | Quy trình thay thế 2 bên chấp nhận / manager xác nhận |
| Payroll | Có dữ liệu giờ vào-ra/đi trễ | Quy tắc overtime, bảng công duyệt, xuất bảng lương |
| Đặt giao hàng | Phí cố định 20K mô phỏng, trạng thái qua nhân viên | Tích hợp shipper, tính distance/fee thực tế, COD reconciliation |
| Menu | URL ảnh, CRUD, công thức size | Upload file storage + MIME / size / virus check, workflow duyệt menu |
| Kho | Tồn tổng, FIFO/FEFO cơ bản, cảnh báo lô | Tách allocation theo lot, nhập/xuất theo lô & FEFO chuẩn, điều chỉnh có hai bước |
| Khuyến mãi | 1 ưu đãi tốt nhất/đơn, 6 loại đơn giản hóa | Cron tự kích hoạt chiến dịch đã lên lịch, engine rule theo giờ/thứ trong tuần, stacking, mã batch, ROI analytics |
| Bảo mật | JWT Bearer trong sessionStorage, BCrypt, Helmet, role & chi nhánh, rate-limit login/order | Cookie HttpOnly hoặc BFF, MFA, CSRF, rotate tokens, TLS, audit toàn diện, security review, secrets vault |
| DB/triển khai | `CREATE TABLE IF NOT EXISTS`, docker compose local | Migration versioned, backups, replication, observability, load/stress test, CI integration tests |

**Đừng bật `DEMO_PAYMENT_ENABLED=true` trên server public:** endpoint thanh toán thử nghiệm đánh dấu đơn đã trả tiền mà không có tiền thật, gây rủi ro tài chính. Dùng mặc định `false` khi đưa ứng dụng ngoài môi trường học tập.

**Kiểm soát truy cập dữ liệu:** demo cho nhân viên xác thực xem đối tượng theo chi nhánh; cần rà soát IDOR, idempotency, validation đầu vào và phân quyền tại tất cả thao tác trước sản xuất.
