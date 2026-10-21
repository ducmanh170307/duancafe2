# ☕ Cafe Management – ERP/POS chuỗi cà phê đa chi nhánh

Backend: Node.js + Express + SQL Server (mssql). Giao diện: `index.html`.

## Cài đặt
```bash
npm install
cp .env.example .env     # rồi điền thông tin SQL Server của bạn
npm run dev              # hoặc: npm start
```
Server chạy tại http://localhost:5000. Mở `index.html` bằng trình duyệt để dùng giao diện.

## Cấu trúc
```
config/db.js                       kết nối SQL Server
controllers/
  branchController.js              Chi nhánh            (Mạnh)
  shiftController.js               Mở/đóng ca, thu chi  (Mạnh)
  hrController.js                  Nhân sự, chấm công   (Như)
  inventoryController.js           Nhập kho             (Như)
  promotionController.js           Khuyến mãi           (Như)
  posController.js                 POS, tạo đơn         (Trúc)
  kdsController.js                 Màn hình bếp         (Linh)
  productController.js             Menu sản phẩm        (Linh)
models/productModel.js             Truy vấn sản phẩm    (Linh)
routes/productRoutes.js            Route sản phẩm       (Linh)
server.js                          Khai báo route, khởi động server
index.html                         Giao diện ERP/POS
```

## Phân công nhóm
| Thành viên | Phụ trách | Nhánh |
|---|---|---|
| Mạnh (trưởng nhóm) | Hạ tầng, Chi nhánh, Ca làm | `feature/manh-branch-shift` |
| Như | Nhân sự, Kho, Khuyến mãi | `feature/nhwi-hr-inventory-promo` |
| Trúc | POS bán hàng | `feature/truc-pos` |
| Linh | Menu, Bếp (KDS) | `feature/linh-menu-kds` |

## Quy ước
- Không commit `.env` và `node_modules/`.
- Mỗi người làm trên nhánh riêng, tạo Pull Request vào `main`.
- Trước khi push: `git pull origin main --rebase`.
- Commit: `feat:`, `fix:`, `docs:`, `chore:`.
