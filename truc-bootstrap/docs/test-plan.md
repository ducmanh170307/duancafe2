# Kiểm thử theo Use Case

## Kiểm thử tự động có sẵn

`npm test` chạy Node built-in test runner: công thức chốt tiền, phần trăm/tiền/BOGO/freeship, VAT demo và GPS. `npm run build` thử compile React/Vite. `scripts/check-api.ps1` là smoke test API khi hệ thống chạy.

## Kịch bản tích hợp thủ công trên MySQL

| TC | Vai trò | Chuẩn bị và thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Admin | Đăng nhập admin@beanflow.vn | Login thành công, sidebar role Admin |
| TC02 | Thu ngân | Vào POS và tạo đơn có 2 món, trả đủ CASH | Đơn `CONFIRMED`, số thứ tự có giá trị, kho trừ theo công thức |
| TC03 | Pha chế | Vào KDS, bấm bắt đầu → pha xong → giao | Trạng thái `COMPLETED`; đơn biến mất khỏi KDS |
| TC04 | Khách | Đặt Web với `DEMO` sau khi chọn chi nhánh OPEN | Trả mã đơn, tra cứu ra `CONFIRMED` |
| TC05 | Khách | Đặt Web `PAY_AT_PICKUP`, nhân viên thu trong tab Đơn hàng | Đơn không vào KDS đến khi thu đủ |
| TC06 | Thu ngân | Thanh toán một phần, rồi thanh toán nốt | Lần 1 `PARTIAL`, lần 2 `PAID`; kho chỉ trừ một lần |
| TC07 | Thu ngân | Hủy trước khi pha | Trả tồn kho, ghi `REFUND`, hoàn voucher và điểm |
| TC08 | Pha chế | Ghi pha lại 1 món khi đang pha | `remake_count` tăng, kho giảm thêm, lưu audit |
| TC09 | Quản lý | Tạo ca trùng giờ cho cùng nhân viên | Trả lỗi trùng lịch |
| TC10 | Nhân viên | Check-in GPS ở xa >250m | API trả 400 |
| TC11 | Nhân viên | Check-in QR ký cho chi nhánh khác hoặc hết hạn | API trả 400 |
| TC12 | Thu ngân | Mở ca không được phân lịch/check-in | API từ chối |
| TC13 | Thu ngân | Chốt ca còn đơn chưa hoàn tất | API từ chối |
| TC14 | Quản lý | Chốt ca có chênh nhưng thiếu lý do | API từ chối |
| TC15 | Quản lý | Duyệt chốt với tiền giữ + nộp khác counted | API từ chối |
| TC16 | Quản lý | Nhập kho 6.000.000đ và tự xác nhận | API từ chối, chỉ Admin được duyệt |
| TC17 | Admin | Xác nhận nhập kho, reload tồn | Kho tăng, `avg_cost` cập nhật, phiếu khóa |
| TC18 | Quản lý | Chuyển kho A→B, bên B xác nhận | A giảm trước, B tăng khi nhận, có lịch sử |
| TC19 | Admin | Xóa mềm món đã bán | Sản phẩm ẩn, lịch sử đơn vẫn có tên & giá cũ |
| TC20 | Guest | Dùng voucher hết hạn/khác kênh | API 400, không tạo đơn sai ưu đãi |
| TC21 | Cashier CN1 | Cố thao tác đơn CN2 | HTTP 403 |
| TC22 | Admin | Tạo 2 thanh toán cùng lúc cho một order | Lock row, không được thanh toán thừa/tính điểm hai lần |

## Bộ test sản phẩm cuối kỳ cần bổ sung

- Integration test với MySQL thực + transaction rollback; coverage cho chốt ca, partial pay, đồng thời ở 2 quầy.
- Concurrency/load test sản phẩm bán chạy khi tồn thấp, race khi redeem voucher và cấp queue.
- E2E UI Playwright: POS → KDS, kho → menu, guest checkout, phân ca → check-in.
- Security test: IDOR branch, brute force, XSS, CSRF nếu chuyển cookie, JWT expiry, tampering giá từ frontend.
