# Đặc tả 8 luồng nghiệp vụ – BeanFlow

## Luồng 1 – Phân ca và chấm công

**Tác nhân:** Quản lý chi nhánh, Nhân viên.

1. Quản lý nhập tên ca, vị trí, số người, thời gian; hệ thống tạo `work_shifts`.
2. Quản lý xếp nhân sự; backend chặn trùng giờ và vượt 48 giờ/tuần, báo thiếu người trên UI.
3. Nhân viên vào trang **Chấm công**, chọn ca đã phân, check-in GPS trong bán kính 250m hoặc QR token ký JWT 2 phút do quản lý phát.
4. Check-out ghi thời điểm kết thúc, số phút về sớm/đi trễ.
5. Nhân viên nộp yêu cầu `CORRECTION`, `LEAVE`, `SWAP`; quản lý duyệt sửa công/xin nghỉ. `SWAP` mới lưu yêu cầu và từ chối duyệt tự động vì cần người nhận ca, chưa có workflow hoán đổi có xác nhận hai bên.
6. Quản lý có thể xem số giờ qua bảng công; export bảng lương/tính tăng ca nâng cao cần phát triển thêm.

## Luồng 2 – Mở ca

**Tác nhân:** Thu ngân, Quản lý.

1. Thu ngân check-in ca trước khi mở, chọn `register`.
2. Nhập số tiền đầu ca; khi lệch số tiền giữ lại từ ca trước, bắt buộc ghi lý do.
3. Tạo `cash_shifts(status=OPEN)`; POS được phép tạo đơn.
4. Mọi thanh toán tiền mặt đơn thuộc ca, nội bộ có `cash_movements` thu/chi. Thu/chi >500.000đ cần quản lý thao tác trực tiếp.
5. Tạm khóa ca `PAUSED` sẽ chặn nhận thanh toán tiền mặt.

## Luồng 3 – Bán POS → KDS → giao món

**Tác nhân:** Thu ngân, Pha chế.

1. Chọn bàn? **MVP hỗ trợ loại đơn uống tại chỗ/mang đi/giao hàng, chưa quản lý số bàn vật lý.**
2. Thu ngân thêm món (size, topping, đường, đá, ghi chú), chọn khách thành viên theo số điện thoại, mã voucher.
3. Server kiểm tra giá, điều kiện voucher, trạng thái chi nhánh và lập đơn `PENDING_PAYMENT`.
4. Ghi nhận tiền mặt thủ công hoặc **DEMO**. Có thể thu nhiều lần một đơn. Thẻ/QR/MoMo/ZaloPay/VNPay thật chưa kết nối, không tự xác nhận.
5. Khi thu đủ (hoặc đơn 0đ do sử dụng điểm/giảm 100%, không cần thanh toán): khóa kho kiểm đủ, trừ nguyên liệu theo công thức, trừ voucher/điểm, cộng điểm, cấp số thứ tự; đơn chuyển `CONFIRMED`.
6. KDS hiển thị đơn, lọc theo nhóm món, bấm `PREPARING → READY → COMPLETED` hoặc `DELIVERING → COMPLETED`.
7. Lỗi pha: ghi `remake_count`, tiếp tục trừ nguyên liệu để phản ánh hao hụt.
8. Hủy trước pha: hoàn tiền mặt/DEMO, hoàn lại tồn/điểm/voucher. Sau pha chỉ Quản lý/Admin hủy và không cộng tồn, tạo audit hao hụt.

## Luồng 4 – Đặt món qua Web

1. Khách truy cập `/dat-hang` không cần login; có thể đăng ký/đăng nhập thành viên để tích/dùng điểm.
2. Chọn chi nhánh đang `OPEN` & có ca thu ngân đang mở; món hết/tạm ngừng không thể chọn.
3. Thêm món, size, toppings; đặt nhận tại quầy hoặc giao hàng với phí **mô phỏng cố định 20.000đ**.
4. Nhập mã voucher/điểm, chọn `DEMO` hoặc `PAY_AT_PICKUP`. Đơn hẹn giờ lưu `requested_at`, KDS hiện trước thời gian hẹn tối đa 15 phút.
5. `DEMO` tự đánh dấu đã thanh toán nhưng **không có tiền thực**. `PAY_AT_PICKUP` chỉ sang KDS sau khi thu ngân ghi nhận tiền mặt trong **Đơn hàng**.
6. Tra cứu qua `order_code + guest_phone`.
7. Giao hàng có trạng thái `DELIVERING`, nhưng chưa có app tài xế / API đơn vị vận chuyển.

## Luồng 5 – Đóng ca / chốt ca

1. Thu ngân gửi đóng ca khi không còn đơn đang xử lý gắn ca đó.
2. Hệ thống tính `dự kiến = đầu ca + thu mặt - hoàn mặt + thu nội bộ - chi nội bộ`.
3. Nhập tiền kiểm đếm, bắt buộc giải trình khi lệch.
4. Chuyển `PENDING_APPROVAL`, Quản lý nhập tiền giữ lại và tiền nộp, bắt buộc cộng đúng với thực tế.
5. Chuyển `CLOSED`, không sửa ca đã khóa. Khi mọi ca đã chốt, chi nhánh chỉ `CLOSED` nếu không còn đơn online dở dang; nếu có, chuyển `PAUSED`.

## Luồng 6 – Quản lý menu

1. Admin tạo category/sản phẩm/variant và công thức nguyên liệu theo size.
2. Bắt buộc giá >0, mỗi variant có ít nhất 1 nguyên liệu. `products` không xóa cứng: ẩn mềm để giữ dữ liệu lịch sử.
3. Quản lý chi nhánh chỉ bật/tắt món tại chi nhánh và đổi giá địa phương.
4. React POS / Web tải lại menu qua API; thay đổi không yêu cầu triển khai frontend.

## Luồng 7 – Nhập kho

1. Quản lý lập `stock_receipts` và các dòng (nguyên liệu, lượng, giá, mã lô, hạn dùng), lưu nháp.
2. Gửi phiếu duyệt. Phiếu trị giá trên 5 triệu cần Admin duyệt; dưới mức này quản lý xác nhận.
3. Xác nhận ghi `branch_inventory` cộng lượng, tính `avg_cost`, ghi `stock_movements` và `inventory_lots`.
4. Kiểm kê nhập số thực tế + lý do, có quyền quản lý mới ghi điều chỉnh.
5. Chuyển kho A → B: trừ kho A tạo `IN_TRANSIT`, chi nhánh B xác nhận nhận mới cộng kho B.
6. Cảnh báo lượng thấp và lot cận hạn trong 7 ngày.

**Lưu ý:** demo đang quản lý tồn tổng và thông tin lô nhận; các kịch bản kiểm kê/chuyển kho và hoàn món chưa hoàn chỉnh khả năng truy vết FEFO từng đơn/lô. Đây là giới hạn cần xử lý trước vận hành thật.

## Luồng 8 – Khuyến mãi

1. Admin nhập chương trình: tên, mã, loại, giá trị, thời gian, chi nhánh/kênh, sản phẩm, hạng, số lượt.
2. Lưu nháp, kích hoạt / tạm dừng / kết thúc. Ưu đãi tự động đang hoạt động có thể bị chặn khi chồng lấn theo thời gian và kênh.
3. Checkout tính giá trên server, kiểm điều kiện áp dụng và số lượt; cập nhật khi thanh toán đủ trong transaction.
4. Khi hủy hoàn toàn, trả lượt ưu đãi và điểm liên quan.

**Đơn giản hóa:** trạng thái `SCHEDULED` chưa có cron tự kích hoạt (Admin phải kích hoạt); chỉ áp một khuyến mãi tốt nhất; BOGO áp cùng biến thể, combo là mức giảm cố định, điểm nhân chỉ nhân số điểm kiếm được. Lịch ngày/khung giờ/thứ trong tuần, stacking, mã hàng loạt và phân tích ROI đầy đủ chưa triển khai.
