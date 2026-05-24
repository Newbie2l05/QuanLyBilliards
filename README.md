# 🎱 Billiard Club Pro — Hệ Thống Quản Lý Câu Lạc Bộ Billiards

<div align="center">

![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-9.0-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![SignalR](https://img.shields.io/badge/SignalR-Realtime-5C2D91?style=for-the-badge&logo=.net&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/License-Education-green?style=for-the-badge)

**Hệ thống quản lý quán billiards theo thời gian thực, hỗ trợ vận hành bàn chơi, gọi món, kho, membership, QR order và báo cáo**

[Tính năng](#-tính-năng-chính) · [Cài đặt](#-hướng-dẫn-cài-đặt) · [Chạy project](#-hướng-dẫn-chạy-project) · [Deploy](#-deploy-demo) · [Thành viên](#-danh-sách-thành-viên)

</div>

---

# 📋 Tên đề tài

## Billiard Club Pro — Hệ Thống Quản Lý Câu Lạc Bộ Billiards

---

# 📖 Giới thiệu hệ thống

**Billiard Club Pro** là hệ thống quản lý vận hành quán billiards được xây dựng để phục vụ các nghiệp vụ thực tế như quản lý bàn, gọi món, thanh toán, membership, kho nguyên liệu và QR order tại bàn.

Hệ thống được phát triển bằng **ASP.NET Core 9 + MySQL + JavaScript + Bootstrap**, có giao diện quản trị realtime, hỗ trợ vận hành trên máy tính và trải nghiệm gọi món trên điện thoại cho khách hàng.

### 🎯 Mục tiêu dự án

- Xây dựng hệ thống quản lý quán billiards hoàn chỉnh
- Áp dụng kiến thức lập trình web full-stack vào bài toán thực tế
- Tối ưu quy trình vận hành bàn, món, kho và thanh toán
- Tạo trải nghiệm quản trị trực quan, hiện đại và dễ mở rộng

---

# 👥 Danh sách thành viên

| Họ và tên | Vai trò |
|-----------|---------|
| **Đặng Hoàng Tùng** | Developer |
| **Lâm Chí Thành** | Project Manager / Developer |

---

# 📌 Phân công nhiệm vụ

| Thành viên | Công việc |
|-----------|-----------|
| **Đặng Hoàng Tùng** | Thiết kế và hoàn thiện giao diện quản trị, xử lý frontend, tối ưu trải nghiệm người dùng, tích hợp giao diện mobile QR order |
| **Lâm Chí Thành** | Xây dựng backend, cơ sở dữ liệu, xử lý nghiệp vụ bàn chơi, thanh toán, membership, kho và triển khai hệ thống |

---

# ✨ Tính năng chính

## 🎱 Quản lý bàn

| Tính năng | Mô tả |
|-----------|-------|
| **Quản lý trạng thái bàn** | Theo dõi bàn trống, đang chơi, đặt trước theo thời gian thực |
| **Mở / đóng bàn** | Quản lý phiên chơi nhanh chóng |
| **Chuyển bàn / gộp bàn** | Hỗ trợ xử lý linh hoạt khi khách đổi bàn |
| **Tìm kiếm nâng cao** | Tìm theo tên bàn, trạng thái, món đang gọi, thông tin đặt bàn |
| **QR order tại bàn** | Khách quét mã và gửi order trực tiếp từ điện thoại |

---

## 🍹 Menu, kho và order

| Tính năng | Mô tả |
|-----------|-------|
| **Quản lý món bán** | Danh sách món, danh mục, giá, mô tả, ảnh |
| **Quản lý kho** | Theo dõi số lượng nguyên liệu và mức tồn tối thiểu |
| **Tự động trừ kho** | Khi order được duyệt hoặc cộng bill |
| **Cảnh báo sắp hết / tạm hết** | Đồng bộ giữa kho và màn hình bán món |
| **QR Order chờ duyệt** | Order của khách vào trạng thái pending, nhân viên duyệt mới cộng bill |

---

## 💳 Thanh toán

| Tính năng | Mô tả |
|-----------|-------|
| **Tính tiền giờ chơi** | Tính theo thời gian thực |
| **Khung giờ linh hoạt** | Cấu hình giá theo từng mốc thời gian |
| **Combo / phụ thu / giảm giá** | Hỗ trợ nhiều kịch bản thanh toán |
| **Copy hóa đơn** | Sao chép hóa đơn ngắn, nội dung chuyển khoản, chi tiết món |
| **Membership khi thanh toán** | Nhập SĐT để tự gắn khách hàng thành viên |

---

## 👤 Membership

| Tính năng | Mô tả |
|-----------|-------|
| **Tìm theo số điện thoại** | Tìm member nhanh khi thanh toán hoặc quản lý riêng |
| **Theo dõi tổng chi và tổng giờ** | Hỗ trợ đánh giá khách hàng thân thiết |
| **Xếp hạng thành viên** | Cấu hình mốc hạng membership |
| **Lịch sử thanh toán** | Xem lại toàn bộ giao dịch của từng member |
| **Quản trị hạng** | Cấu hình quyền lợi theo từng hạng |

---

## 📊 Dashboard và báo cáo

| Tính năng | Mô tả |
|-----------|-------|
| **Dashboard điều hành** | Theo dõi công suất, bàn đang phục vụ, món nổi bật |
| **Báo cáo doanh thu** | Tổng hợp thanh toán theo thời gian |
| **Hiệu suất bàn** | Theo dõi bàn hoạt động tốt / ít hoạt động |
| **Tìm kiếm chuyên sâu** | Lọc theo bàn, món, hình thức thanh toán, ghi chú |
| **Realtime update** | Đồng bộ dữ liệu qua SignalR |

---

# 🎨 Giao diện và trải nghiệm

- Giao diện dark mode hiện đại
- Responsive trên desktop và mobile
- Hiệu ứng mượt cho các modal và thao tác chính
- Giao diện QR order tối ưu cho điện thoại
- Sidebar và màn hình quản lý đồng bộ một ngôn ngữ thiết kế

---

# 🛠️ Công nghệ sử dụng

| Công nghệ | Vai trò |
|-----------|---------|
| **ASP.NET Core 9** | Backend framework |
| **Dapper** | Truy vấn dữ liệu |
| **MySQL** | Cơ sở dữ liệu |
| **JWT** | Xác thực người dùng |
| **SignalR** | Đồng bộ realtime |
| **HTML / CSS / JavaScript** | Frontend |
| **Bootstrap 5** | UI framework |
| **GitHub** | Quản lý source code |
| **Laragon / MySQL local runtime** | Môi trường chạy local |
| **Cloudflare Tunnel** | Demo public khi cần |

---

# 📁 Cấu trúc dự án

```bash
webnangcao/
├── BidaCSharp/
│   ├── Controllers/
│   ├── Data/
│   ├── Hubs/
│   ├── Models/
│   ├── Services/
│   ├── wwwroot/
│   │   ├── css/
│   │   ├── images/
│   │   ├── js/
│   │   ├── customers.html
│   │   ├── dashboard.html
│   │   ├── index.html
│   │   ├── menu.html
│   │   ├── reports.html
│   │   ├── settings.html
│   │   ├── table-order.html
│   │   └── tables.html
│   ├── appsettings.json
│   ├── schema.sql
│   └── BidaCSharp.csproj
├── postman/
├── run.bat
├── seed.sql
└── README.md
```

---

# 🚀 Hướng dẫn cài đặt

## 1. Clone repository

```bash
git clone https://github.com/Newbie2l05/QuanLyBilliards.git
```

---

## 2. Cài môi trường

Yêu cầu:

- `.NET SDK 9`
- `MySQL` hoặc `Laragon`
- `VS Code` hoặc `Visual Studio`

---

## 3. Cấu hình database

File cấu hình chính:

- `BidaCSharp/appsettings.json`

Ví dụ dùng MySQL ngoài:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=127.0.0.1;Port=3306;Database=billiard_club_dev;User ID=root;Password=;Allow User Variables=True;"
  },
  "LocalRuntimeDatabase": {
    "Enabled": false
  }
}
```

Sau đó import:

```text
BidaCSharp/schema.sql
```

---

# ▶️ Hướng dẫn chạy project

## Chạy nhanh bằng script

Tại thư mục gốc:

```powershell
.\run.bat
```

Ứng dụng sẽ chạy tại:

```text
http://localhost:5289
```

## Chạy bằng dotnet

```powershell
cd .\BidaCSharp
dotnet run
```

---

# 📱 QR Order

Link gọi món tại bàn:

```text
/table/{tableId}
```

Ví dụ:

```text
http://localhost:5289/table/1
```

Chức năng này hỗ trợ:

- xem menu trên điện thoại
- thêm món vào giỏ
- ghi chú món
- gửi order chờ duyệt
- chống spam gửi liên tục

---

# 🔐 Phân quyền hệ thống

| Vai trò | Quyền chính |
|---------|-------------|
| **Admin** | Toàn quyền quản trị hệ thống |
| **Staff** | Vận hành bàn, order, thanh toán với quyền giới hạn |

Tài khoản nhân viên được tạo trong mục `Cài đặt`.

---

# 🌐 Deploy demo

## Demo nhanh để thầy kiểm tra

Cách phù hợp nhất:

1. chạy project trên máy local
2. chạy database local
3. public bằng Cloudflare Tunnel

Ví dụ:

```powershell
cloudflared tunnel --url http://localhost:5289
```

## Publish bản release

```powershell
cd .\BidaCSharp
dotnet publish -c Release -o .\publish
```

---

# ✅ Checklist trước khi demo

- đăng nhập được hệ thống
- mở bàn / đóng bàn hoạt động
- gọi món và cộng bill đúng
- kho tự cập nhật khi order
- membership nhận SĐT khi thanh toán
- QR order gửi được từ điện thoại
- báo cáo và dashboard hiển thị đúng

---

# 📄 Ghi chú

- Dự án được phát triển phục vụ mục đích học tập, báo cáo và demo đồ án.
- Có thể điều chỉnh lại cấu hình database theo máy sử dụng.
- Nếu cần public nhanh để kiểm tra, nên dùng Cloudflare Tunnel.

---

<div align="center">

## 🎱 Billiard Club Pro
### Real-time Billiards Club Management System

</div>
