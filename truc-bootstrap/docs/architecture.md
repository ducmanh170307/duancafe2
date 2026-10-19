# Kiến trúc hệ thống BeanFlow (MVC)

## 1. Kiến trúc triển khai

```mermaid
flowchart LR
    U[Nhân viên / Khách hàng] --> W[React SPA\nVite / Nginx]
    W -->|REST /api| R[Express Router + JWT / RBAC]
    R --> C[Controllers]
    C --> S[Services / Transactions]
    S --> M[Models / Repository SQL]
    M --> D[(MySQL 8.4 InnoDB)]
    S --> A[(audit_logs)]
    C --> W
```

MVC nằm tại **backend**, React là View/client riêng:

- **Model** (`apps/api/src/models`): truy vấn dữ liệu và xây các mô hình trả về. Một số truy vấn đặc thù về giao dịch đặt gần Service để thực hiện trong cùng transaction MySQL.
- **View** (`apps/web/src/pages`, `components`): React JSX, Tailwind CSS, quản lý state trên client; không truy vấn MySQL trực tiếp.
- **Controller** (`apps/api/src/controllers`): chuyển HTTP request thành các thao tác nghiệp vụ, validate quyền, trả JSON.
- **Routes** (`apps/api/src/routes`): định nghĩa endpoint và RBAC.
- **Service** (`apps/api/src/services`): nghiệp vụ cần nhiều bảng, tránh fat controller. Các luồng checkout, payment, inventory & promotion hoạt động bên trong MySQL transaction.

## 2. Sơ đồ thực thể (rút gọn)

```mermaid
erDiagram
    BRANCHES ||--o{ USERS : employs
    BRANCHES ||--o{ REGISTERS : has
    BRANCHES ||--o{ WORK_SHIFTS : schedules
    WORK_SHIFTS ||--o{ SHIFT_ASSIGNMENTS : contains
    USERS ||--o{ SHIFT_ASSIGNMENTS : assigned
    SHIFT_ASSIGNMENTS ||--o| ATTENDANCE : recorded
    USERS ||--o{ ATTENDANCE_REQUESTS : requests
    REGISTERS ||--o{ CASH_SHIFTS : holds
    USERS ||--o{ CASH_SHIFTS : operates
    CASH_SHIFTS ||--o{ CASH_MOVEMENTS : logs
    CASH_SHIFTS ||--o{ ORDERS : sells
    BRANCHES ||--o{ ORDERS : receives
    ORDERS ||--|{ ORDER_ITEMS : contains
    ORDERS ||--o{ PAYMENTS : records
    CATEGORIES ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ PRODUCT_VARIANTS : sizes
    PRODUCT_VARIANTS ||--o{ RECIPES : uses
    INGREDIENTS ||--o{ RECIPES : referenced
    BRANCHES ||--o{ BRANCH_INVENTORY : stores
    INGREDIENTS ||--o{ BRANCH_INVENTORY : balances
    STOCK_RECEIPTS ||--|{ STOCK_RECEIPT_LINES : contains
    BRANCHES ||--o{ STOCK_RECEIPTS : imports
    BRANCHES ||--o{ STOCK_MOVEMENTS : tracks
    PROMOTIONS ||--o{ PROMOTION_USES : applies
    ORDERS ||--o| PROMOTION_USES : redeems
    USERS ||--o| CUSTOMER_PROFILES : member
    CUSTOMER_PROFILES ||--o{ LOYALTY_LEDGER : tracks
```

## 3. Trạng thái đơn hàng

```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT : Tạo đơn
    PENDING_PAYMENT --> CONFIRMED : Đã thu đủ tiền
    PENDING_PAYMENT --> CANCELLED : Hủy / hết hạn (thao tác demo)
    CONFIRMED --> PREPARING : Bắt đầu pha
    PREPARING --> READY : Pha xong
    READY --> COMPLETED : Khách nhận tại quầy
    READY --> DELIVERING : Đơn giao hàng
    DELIVERING --> COMPLETED : Đã giao
    CONFIRMED --> CANCELLED : Hủy trước pha / hoàn kho
    PREPARING --> CANCELLED : Quản lý duyệt, tính hao hụt
    READY --> CANCELLED : Quản lý duyệt, tính hao hụt
```

- Pha chế chỉ nhìn thấy đơn đã **thu đủ tiền**.
- Tại thời điểm xác nhận thanh toán đủ, hệ thống **khấu trừ tồn khả dụng** như một dạng giữ/ghi nhận sử dụng nguyên liệu tránh oversell. Nếu hủy trước khi pha thì cộng trả tồn (bản demo chưa phục hồi số lô gốc chính xác).
- Chuyển trạng thái chỉ theo hướng hợp lệ; đã giao/đã hủy không sửa đơn.
- `queue_number` cấp theo **ngày + chi nhánh**, sử dụng bảng `daily_sequences` và `LAST_INSERT_ID` trong transaction.

## 4. Phân quyền tổng quan

| Nhóm chức năng | Admin | Quản lý | Thu ngân | Pha chế | Khách |
|---|---|---|---|---|---|
| Toàn hệ thống / xem báo cáo | ✓ | Chi nhánh | Dashboard cơ bản | – | – |
| Phân ca/duyệt công | ✓ | ✓ | – | – | – |
| Chấm công cá nhân | ✓ | ✓ | ✓ | ✓ | – |
| Mở/bán/chốt ca | ✓ | ✓ | ✓ | – | – |
| Nhận và cập nhật pha chế | ✓ | ✓ | – | ✓ | – |
| Menu toàn chuỗi | ✓ | Đổi trạng thái/giá chi nhánh | Xem | Xem | Xem |
| Kho | ✓ | Chi nhánh | – | – | – |
| Khuyến mãi | ✓ | Xem | Xem | – | Áp voucher |
| Đặt món Web | ✓ | ✓ | ✓ | ✓ | ✓ |

API kiểm tra role, nhân viên không phải Admin bị ràng buộc bởi `branch_id` trên JWT identity tải lại từ MySQL.

## 5. Các thao tác nguyên tử

- **Đơn hàng:** xác định giá từ MySQL → tạo order/items → thanh toán → chặn vượt số tiền → kiểm kho bằng `FOR UPDATE` + `UPDATE quantity>=required` → khấu trừ kho → cấp số thứ tự → tăng lượt voucher → tích điểm → COMMIT.
- **Phiếu nhập:** kiểm trạng thái → khóa phiếu → cập nhật stock + weighted avg cost + lot + movement → khóa phiếu → COMMIT.
- **Chốt ca:** chặn đơn chưa hoàn tất → tính tiền dự kiến từ payments + cash movements → lưu counted/discrepancy → quản lý duyệt → khóa ca.

`withTransaction` được triển khai tại `apps/api/src/config/db.js` dưới tên `transaction`, lấy riêng MySQL connection từ pool. Không có transaction phân tán tới ngân hàng: tích hợp đó phải dùng webhook idempotent & outbox riêng.
