# Thiết kế cơ sở dữ liệu MySQL

**DDL duy nhất:** `apps/api/src/db/schema.sql`, chạy `npm run db:migrate`.

## Nhóm bảng

| Nhóm | Bảng |
|---|---|
| Chuỗi & người dùng | `branches`, `users`, `customer_profiles`, `registers` |
| Phân ca | `work_shifts`, `shift_assignments`, `attendance`, `attendance_requests` |
| POS / tiền | `cash_shifts`, `cash_movements`, `orders`, `order_items`, `payments`, `daily_sequences` |
| Menu | `categories`, `products`, `product_variants`, `toppings`, `branch_products`, `branch_variant_prices` |
| Nguyên liệu | `ingredients`, `recipes`, `topping_recipes`, `branch_inventory`, `inventory_lots`, `stock_movements` |
| Nhập/chuyển | `suppliers`, `stock_receipts`, `stock_receipt_lines`, `stock_transfers`, `stock_transfer_lines` |
| Khuyến mãi | `promotions`, `promotion_branches`, `promotion_products`, `promotion_uses` |
| Điểm & audit | `loyalty_ledger`, `audit_logs` |

## Quy tắc dữ liệu

- Mọi bảng giao dịch InnoDB, có khóa ngoại; `user_id`, `branch_id`, `order_id` luôn được kiểm quyền tại backend.
- Giá trị tiền `DECIMAL(14,2)` lưu đơn vị VNĐ; khi tính toán JavaScript vẫn dùng `Number` để dễ học: ứng dụng thương mại nên lưu đơn vị đồng nguyên hoặc dùng decimal arithmetic chuẩn.
- `products.status=DELETED` biểu diễn xóa mềm; `order_items` lưu snapshot tên, size, đơn giá, tùy chọn và tổng dòng.
- `payments` lưu charge/refund, `direction` và trạng thái. Đơn có thể có nhiều khoản thu từ một hoặc nhiều phương thức, nhưng **QR/thẻ/ví ngoài** chưa có cổng tích hợp.
- `promotion_uses(order_id UNIQUE)` đảm bảo 1 ưu đãi/đơn trong MVP.
- Kho chi nhánh giữ số lượng tổng; lô nhận và hạn sử dụng riêng. Giảm lô trước hết hạn khi bán nhằm hỗ trợ FEFO đơn giản, nhưng chưa có allocation table truy xuất chính xác lô nào đã tiêu hao vào từng ly.
- `daily_sequences` dùng atomic upsert + `LAST_INSERT_ID()` cho queue number không xung đột khi hai nhân viên thanh toán đồng thời.
- Công thức có thể định nghĩa cho topping qua `topping_recipes`.

## Idempotency & migration

- `db:migrate` dùng `CREATE TABLE IF NOT EXISTS`, có thể chạy lại; **không** phải hệ thống migration theo version để chỉnh sửa schema cũ.
- `db:seed` tránh trùng nhóm dữ liệu demo phổ biến, nhưng một số thao tác tạo phiên/ca có kiểm tra tương ứng theo tên; không nên chạy seed nhiều lần sau khi đã dùng dữ liệu thật.
- Muốn reset demo hoàn toàn: `docker compose down -v` xóa **toàn bộ dữ liệu MySQL** trong volume; **không sử dụng với dữ liệu cần giữ lại**.
