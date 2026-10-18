# ☕ BeanFlow – Phần mềm quản lý chuỗi cà phê (MVC)

**Đồ án Công nghệ phần mềm:** React.js + Tailwind CSS v4 + Node.js/Express 5 + MySQL 8.4. Giao diện **tiếng Việt** cho 5 vai trò: Chủ chuỗi/Admin, Quản lý chi nhánh, Thu ngân, Pha chế, Khách hàng.

> **Tình trạng:** Repository đồ án / demo kỹ thuật có triển khai các luồng cốt lõi trên MySQL. Đây **không phải** phần mềm POS thương mại được chứng nhận. Thanh toán ngân hàng, hóa đơn điện tử VAT, SMS/Zalo, GPS chống gian lận, vân tay, offline POS và tích hợp giao hàng cần dịch vụ/hardware bên ngoài; xem [`docs/limitations.md`](docs/limitations.md).

## 1. Chức năng đã có

| Nghiệp vụ | Tính năng sử dụng trong demo |
|---|---|
| 1. Phân ca & chấm công | Tạo ca, gán nhân sự, chống trùng lịch & >48h/tuần, thiếu người, GPS 250m, token QR 2 phút, check-out, yêu cầu nghỉ/sửa công, duyệt |
| 2. Mở ca | Quầy POS, check-in trước khi mở (thu ngân), kiểm đầu ca, ghi nhận thu/chi, tạm khóa |
| 3. POS & pha chế | Chọn size/topping/đường/đá, ưu đãi, thanh toán tiền mặt thủ công hoặc mô phỏng, trả nhiều lần, KDS, số thứ tự, làm lại/trừ kho |
| 4. Đặt món web | Khách vãng lai/thành viên, chọn chi nhánh, giỏ hàng, voucher/điểm, nhận tại quầy/giao hàng phí cố định demo, hẹn giờ, tra cứu đơn |
| 5. Đóng & chốt ca | Kiểm các đơn chưa xong, tổng kết tiền mặt/thu chi, chênh lệch cần lý do, quản lý duyệt, khóa ca |
| 6. Menu | Danh mục, CRUD món, các size, giá, công thức, ẩn mềm, bật/tắt tại chi nhánh, giá riêng chi nhánh |
| 7. Kho | Tồn, cảnh báo thấp & lô cận hạn, phiếu nhập/duyệt, giá vốn bình quân, kiểm kê, chuyển kho nhận/xuất, nhật ký |
| 8. Khuyến mãi | % / số tiền / BOGO / combo / freeship / hệ số điểm, phạm vi chi nhánh/món/kênh, giới hạn lượt, kích hoạt/dừng |
| Báo cáo & quản trị | Dashboard doanh thu, top món, doanh thu theo phương thức, audit log, phân quyền theo chi nhánh, thêm nhân viên |

## 2. Kiến trúc

```text
coffee-chain-mvc/
├── apps/
│   ├── api/                       # Node.js + Express 5 theo MVC
│   │   ├── src/
│   │   │   ├── models/             # SQL queries / truy cập dữ liệu
│   │   │   ├── controllers/        # HTTP handlers
│   │   │   ├── routes/             # API routes + phân quyền
│   │   │   ├── services/           # Nghiệp vụ liên module / transaction
│   │   │   ├── middleware/         # JWT / RBAC / error handlers
│   │   │   ├── config/             # Env / MySQL pool
│   │   │   ├── db/                 # MySQL schema + migration + seed
│   │   │   └── utils/
│   │   └── tests/                  # Kiểm thử unit
│   └── web/                       # React 19 + Vite + Tailwind CSS 4
│       └── src/
│           ├── pages/             # Mỗi màn hình nghiệp vụ
│           ├── components/        # UI tái sử dụng
│           ├── contexts/          # Auth / toast / chọn chi nhánh
│           ├── api/               # REST client
│           └── utils/
├── docs/                           # ERD, API, nghiệp vụ, giới hạn
├── scripts/                        # Smoke test PowerShell
├── docker-compose.yml              # MySQL + API + web Nginx
├── .env.example
└── package.json                    # npm workspaces
```

**Luồng request:** React View → Express Router → Controller → Service (nghiệp vụ) → Model / MySQL → JSON → React.

## 3. Chạy toàn bộ với Docker (Windows PowerShell)

**Yêu cầu:** Docker Desktop đã chạy, Git (nếu muốn push GitHub). Không cần cài MySQL cục bộ. Chưa cần npm nếu chỉ dùng Docker.

```powershell
# 1. Giải nén source code, rồi mở terminal ở thư mục coffee-chain-mvc
Copy-Item .env.example .env

# 2. Mở .env, thay 3 mật khẩu/secret bằng giá trị riêng mạnh
# MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD, JWT_SECRET

# 3. Build và chạy MySQL + API + frontend
# Chờ healthcheck cho MySQL và API

docker compose up -d --build

# 4. Tạo bảng MySQL (chạy một lần)
docker compose exec api node src/db/migrate.js

# 5. Seed dữ liệu demo (chạy một lần)
docker compose exec api node src/db/seed.js

# 6. Truy cập giao diện
# http://localhost:8080
```

Nếu Docker không chạy được, kiểm tra:

```powershell
docker compose ps
docker compose logs -f mysql
docker compose logs -f api
docker compose logs -f web
```

**Nếu compose vừa chạy xong nhưng trình duyệt chưa có dữ liệu:** bạn chưa chạy lệnh `db:migrate` và `db:seed`, hoặc cần refresh trình duyệt.

## 4. Chạy ở chế độ phát triển với Node.js

**Yêu cầu:** Node.js >= 22.12, Docker Desktop cho MySQL. Node.js v22.21.0 của bạn tương thích với yêu cầu này.

```powershell
Copy-Item .env.example .env
# Sửa mật khẩu + JWT_SECRET trong .env

docker compose up -d mysql
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- React/Vite: http://localhost:5173
- API: http://localhost:4000/api/health
- MySQL localhost:3307, database: `coffee_chain`
- Ứng dụng React gọi `/api/...` qua Vite proxy, không phải cấu hình CORS thủ công trong chế độ này.
- **Không còn SQLite hoặc `better-sqlite3`.** Đây là repo MySQL riêng với project MVC cũ, không nên trộn `package.json`/`node_modules` của hai dự án.

## 5. Tài khoản demo (sau `db:seed`)

Mật khẩu chung **chỉ dành cho demo**: `Demo@12345`.

| Vai trò | Email |
|---|---|
| Chủ chuỗi/Admin | `admin@beanflow.vn` |
| Quản lý chi nhánh | `manager@beanflow.vn` |
| Thu ngân | `cashier@beanflow.vn` |
| Pha chế | `barista@beanflow.vn` |
| Thành viên | `customer@beanflow.vn` |

Seed: 2 chi nhánh, sản phẩm + size + công thức, tồn kho, một ca thu ngân mẫu đang mở tại **BeanFlow Hoàn Kiếm**, nhân viên thu ngân đã được phân ca/check-in, 3 đơn hàng để xem Dashboard/KDS. Mã voucher online: `ONLINE20`, giảm 20.000đ cho đơn >=80.000đ; có ưu đãi tự động giảm 10% cho đơn từ 50.000đ. Tại giao diện đăng nhập có nút điền nhanh tài khoản.

## 6. Thử luồng end-to-end

1. Đăng nhập Admin → **Dashboard**, kiểm tra doanh thu đơn mẫu.
2. Mở **POS** → chọn món, size, đường/đá, topping → thu tiền mặt → đơn chuyển sang **KDS**.
3. Đăng nhập Pha chế → **KDS** → Bắt đầu pha → Pha xong → Đã giao khách.
4. Mở trang `/dat-hang` **không cần đăng nhập** → đặt món bằng thanh toán mô phỏng → tra cứu mã đơn; thử dùng voucher `ONLINE20`.
5. Admin → **Kho** → phiếu nhập nháp → gửi duyệt → xác nhận nhập (phiếu >5 triệu chỉ Admin).
6. Admin → **Menu** tạo món/size/công thức → **Khuyến mãi** tạo và kích hoạt voucher.
7. Quản lý → **Phân ca** & **Chấm công** → **Chốt ca**, quản lý phê duyệt.

Chi tiết các test case: [`docs/test-plan.md`](docs/test-plan.md).

## 7. Kiểm thử

```powershell
npm test
npm run build
# Khi API đã chạy:
.\scripts\check-api.ps1
```

Các bài test unit không yêu cầu MySQL. **Test luồng API có MySQL thực tế phải chạy bằng các bước demo ở trên**, chưa có test tích hợp CI với MySQL. GitHub Actions có unit test + build frontend.

## 8. Đưa lên GitHub

```powershell
git init
git add .
git commit -m "feat: init BeanFlow coffee-chain MVC"
git branch -M main
# Tạo repo RỖNG coffee-chain-mvc trên GitHub, sau đó:
git remote add origin https://github.com/USERNAME/coffee-chain-mvc.git
git push -u origin main
```

Hoặc sau khi đăng nhập GitHub CLI: `gh repo create coffee-chain-mvc --private --source=. --push`.

**Lưu ý:** Đừng commit file `.env`, các mật khẩu seed chỉ dành cho học tập; đổi toàn bộ trước khi đưa lên internet. Không dùng cấu hình demo trực tiếp cho hệ thống bán hàng thật.

## 9. Tài liệu chi tiết

- [`docs/architecture.md`](docs/architecture.md): MVC, sơ đồ thành phần, ERD cấp cao.
- [`docs/business-flows.md`](docs/business-flows.md): 8 luồng nghiệp vụ và trạng thái đơn/ca.
- [`docs/database.md`](docs/database.md): Các nhóm bảng và quy tắc transaction.
- [`docs/api.md`](docs/api.md): API REST & ví dụ yêu cầu.
- [`docs/test-plan.md`](docs/test-plan.md): Kiểm thử theo Use Case.
- [`docs/limitations.md`](docs/limitations.md): Các hạng mục thật sự chưa tích hợp và yêu cầu production.
