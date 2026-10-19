# BeanFlow REST API – phiên bản đồ án

Base URL: `http://localhost:4000/api` (dev), `/api` khi chạy Nginx Docker.

Các endpoint bảo vệ dùng header:

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

Response thành công: `{"success":true,"data":{...}}`. Lỗi: `{"success":false,"message":"..."}` và HTTP status thích hợp. `400` validate, `401` chưa đăng nhập, `403` sai quyền/chi nhánh, `404` không thấy dữ liệu, `409` conflict.

## Xác thực, người dùng, chi nhánh

| Method | Endpoint | Vai trò | Mục đích |
|---|---|---|---|
| POST | `/auth/login` | Public | Login trả JWT 8h |
| POST | `/auth/customer-register` | Public | Tạo tài khoản thành viên |
| GET | `/auth/me` | Logged in | Hồ sơ token |
| GET | `/auth/customer-profile` | Customer | Hạng và điểm |
| GET | `/branches` | Public | Danh sách và trạng thái chi nhánh |
| GET | `/branches/:branchId/registers` | Staff | Danh sách quầy |
| PATCH | `/branches/:id/status` | Admin/Manager | Mở/tạm dừng/đóng chi nhánh |
| GET | `/users?branch_id=1` | Admin/Manager | Nhân sự |
| POST | `/employees` | Admin/Manager | Thêm nhân viên |
| GET | `/customers/lookup?phone=...` | Admin/Manager/Cashier | Tra cứu thành viên |
| GET | `/audit?branch_id=1` | Admin/Manager | Nhật ký thao tác |
| GET | `/dashboard?branch_id=1` | Admin/Manager/Cashier | Dashboard |
| GET | `/reports/daily?branch_id=1&date=2026-10-14` | Admin/Manager | Báo cáo ngày |

## Thực đơn

| Method | Endpoint | Vai trò |
|---|---|---|
| GET | `/menu?branch_id=1` | Public |
| GET | `/menu/manage?branch_id=1` | Admin/Manager |
| GET | `/categories` | Public |
| POST | `/categories` | Admin |
| POST | `/products` | Admin |
| PUT | `/products/:id` | Admin |
| PATCH | `/products/:id/status` | Admin |
| PATCH | `/products/:id/availability` | Admin/Manager |
| PATCH | `/products/:id/branch-price` | Admin/Manager |

Ví dụ sản phẩm:

```json
{
  "name": "Cà phê cốt dừa",
  "category_id": 1,
  "description": "Cà phê Việt Nam cùng cốt dừa",
  "emoji": "🥥",
  "variants": [
    {
      "size": "M", "price": 45000,
      "recipe": [
        { "ingredient_id": 1, "quantity": 20 },
        { "ingredient_id": 2, "quantity": 100 }
      ]
    }
  ]
}
```

## Lịch làm và chấm công

| Method | Endpoint | Vai trò |
|---|---|---|
| GET | `/workforce/shifts?branch_id=1` | Admin/Manager |
| POST | `/workforce/shifts` | Admin/Manager |
| POST | `/workforce/shifts/:id/assign` | Admin/Manager |
| GET | `/workforce/qr/:branchId` | Admin/Manager |
| GET | `/workforce/my-attendance` | Nhân viên |
| POST | `/workforce/check-in` | Nhân viên |
| POST | `/workforce/check-out` | Nhân viên |
| POST | `/workforce/requests` | Nhân viên |
| PATCH | `/workforce/requests/:id/review` | Admin/Manager |

Ví dụ check-in GPS:

```json
{"shift_id":1,"method":"GPS","latitude":21.0236,"longitude":105.8541}
```

## Quầy và chốt ca

| Method | Endpoint | Vai trò |
|---|---|---|
| GET | `/register/shifts?branch_id=1` | Admin/Manager/Cashier |
| POST | `/register/open` | Admin/Manager/Cashier |
| POST | `/register/shifts/:id/pause` | Admin/Manager/Cashier |
| POST | `/register/shifts/:id/movements` | Admin/Manager/Cashier |
| GET | `/register/shifts/:id/summary` | Admin/Manager/Cashier |
| POST | `/register/shifts/:id/close` | Admin/Manager/Cashier |
| POST | `/register/shifts/:id/approve` | Admin/Manager |

Ví dụ mở ca: `{"register_id":1,"opening_cash":300000,"opening_note":"Đã kiểm đếm két"}`.

Ví dụ chốt ca: `{"closing_cash":775000,"closing_note":"Đã đối chiếu tiền mặt"}`.

Ví dụ duyệt: `{"kept_cash":300000,"deposited_cash":475000}`.

## Đơn hàng, thanh toán, KDS

| Method | Endpoint | Vai trò |
|---|---|---|
| POST | `/orders` | Admin/Manager/Cashier | Tạo đơn POS |
| GET | `/orders?branch_id=1` | Staff | Danh sách |
| GET | `/orders/:id` | Staff | Chi tiết |
| GET | `/orders/:id/receipt` | Staff | Phiếu bán hàng JSON nội bộ |
| POST | `/orders/:id/pay` | Admin/Manager/Cashier | Ghi nhận thanh toán |
| POST | `/orders/:id/cancel` | Admin/Manager/Cashier | Hủy/hoàn |
| GET | `/orders/kds?branch_id=1` | Admin/Manager/Barista | KDS |
| PATCH | `/orders/:id/status` | Admin/Manager/Barista | Bắt đầu/hoàn thành pha |
| POST | `/orders/:id/remake` | Admin/Manager/Barista | Pha lại (hao hụt) |
| POST | `/public/orders` | Public | Khách web |
| GET | `/public/orders/:code?phone=...` | Public | Tra cứu đơn |
| GET | `/public/queue?branch_id=1` | Public | Màn gọi số đơn giản |

Tạo POS (sau khi có ca đang mở):

```json
{
  "branch_id": 1,
  "cash_shift_id": 1,
  "order_type": "TAKEAWAY",
  "guest_name": "Khách tại quầy",
  "promo_code": "ONLINE20",
  "items": [
    {"variant_id":1,"quantity":2,"sugar":"70%","ice":"50%","topping_ids":[1],"note":"Ít đá"}
  ]
}
```

**Lưu ý:** voucher `ONLINE20` chỉ áp kênh WEB nên không dùng được trên POS; ví dụ trên để minh họa trường `promo_code` chứ không phải payload có thể chạy ngay với seed. Bỏ `promo_code` hoặc tạo mã POS khi thử.

Thanh toán POS một phần:

```http
POST /api/orders/15/pay
Authorization: Bearer ...
Content-Type: application/json

{"method":"CASH","amount":20000}
```

Thực hiện nhiều lần đến khi đủ. Với đơn online trả tại quầy, thêm `cash_shift_id` đang mở trong payload thanh toán tiền mặt.

Ví dụ khách đặt Web:

```json
{
  "branch_id": 1,
  "guest_name": "Nguyễn An",
  "guest_phone": "0911111111",
  "order_type": "TAKEAWAY",
  "payment_mode": "DEMO",
  "promo_code": "ONLINE20",
  "items": [{"variant_id":1,"quantity":3,"topping_ids":[],"sugar":"100%","ice":"100%"}]
}
```

**Chỉ trong demo:** `payment_mode=DEMO` ghi nhận đã thanh toán mà không nhận tiền từ ngân hàng. Khi `DEMO_PAYMENT_ENABLED=false`, thử nghiệm trả về đơn chờ thanh toán.

## Kho

| Method | Endpoint | Vai trò |
|---|---|---|
| GET | `/inventory?branch_id=1` | Admin/Manager |
| GET | `/inventory/history?branch_id=1` | Admin/Manager |
| POST | `/inventory/ingredients` | Admin |
| POST | `/inventory/suppliers` | Admin |
| POST | `/inventory/receipts` | Admin/Manager |
| POST | `/inventory/receipts/:id/submit` | Admin/Manager |
| POST | `/inventory/receipts/:id/confirm` | Admin/Manager (ngưỡng duyệt) |
| POST | `/inventory/count` | Admin/Manager |
| GET | `/inventory/transfers?branch_id=1` | Admin/Manager |
| POST | `/inventory/transfers` | Admin/Manager |
| POST | `/inventory/transfers/:id/receive` | Admin/Manager |

Tạo phiếu nhập:

```json
{
  "branch_id":1,
  "supplier_id":1,
  "lines":[
    {"ingredient_id":1,"quantity":1000,"unit_cost":150,"lot_code":"COFFEE-2026-10","expires_at":"2027-10-01"}
  ]
}
```

## Khuyến mãi

| Method | Endpoint | Vai trò |
|---|---|---|
| GET | `/promotions` | Admin/Manager/Cashier |
| POST | `/promotions` | Admin |
| PATCH | `/promotions/:id/status` | Admin |

Tạo chương trình (sau đó `PATCH status=ACTIVE`):

```json
{
  "name":"Giảm 15% cuối tuần",
  "code":"WEEKEND15",
  "type":"PERCENT",
  "value":15,
  "min_subtotal":80000,
  "starts_at":"2026-10-16 00:00:00",
  "ends_at":"2026-11-20 23:59:59",
  "allowed_channel":"WEB",
  "auto_apply":false,
  "branch_ids":[1],
  "product_ids":[]
}
```

Lưu ý thời gian trên chỉ là ví dụ; phải chọn thời gian hiện tại khi chạy thật.
