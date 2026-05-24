# Hệ Thống Quản Lý Câu Lạc Bộ Billiards

Đồ án xây dựng hệ thống quản lý câu lạc bộ billiards theo thời gian thực, hỗ trợ vận hành quán từ mở bàn, gọi món, thanh toán đến quản lý khách hàng thành viên, kho và báo cáo.

## Thành viên thực hiện

- Đặng Hoàng Tùng
- Lâm Chí Thành

## Mục tiêu dự án

Hệ thống được xây dựng để giải quyết các nhu cầu vận hành thực tế của quán billiards:

- quản lý bàn và trạng thái bàn theo thời gian thực
- mở bàn, đóng bàn, chuyển bàn, gộp bàn
- gọi món và cộng bill trong phiên chơi
- quản lý kho và tự động trừ kho khi phát sinh order
- thanh toán linh hoạt theo giá giờ, combo, phụ thu và giảm giá
- quản lý khách hàng thành viên theo số điện thoại
- hỗ trợ QR Order cho khách gọi món tại bàn
- theo dõi báo cáo doanh thu, hiệu suất bàn và lịch sử giao dịch

## Công nghệ sử dụng

### Backend

- ASP.NET Core 9
- Dapper
- MySQL
- JWT Authentication
- SignalR

### Frontend

- HTML
- CSS
- JavaScript
- Bootstrap 5

### Khác

- Cloudflare Tunnel hoặc ngrok để demo public
- Postman để test API

## Chức năng chính

### 1. Xác thực và phân quyền

- đăng nhập bằng JWT
- phân quyền `admin` và `staff`
- quản lý tạo tài khoản nhân viên trong phần cài đặt

### 2. Quản lý bàn

- xem danh sách bàn theo trạng thái
- mở bàn theo loại bàn
- tính giờ chơi theo thời gian thực
- chuyển bàn, gộp bàn
- đặt bàn trước
- tìm kiếm bàn theo tên bàn, trạng thái, món đang gọi và thông tin đặt bàn

### 3. Quản lý món và kho

- quản lý món bán trong một màn hình thống nhất
- quản lý danh mục món
- quản lý nguyên liệu kho
- cấu hình món gắn với nguyên liệu
- tự động trừ kho khi order được duyệt hoặc cộng bill
- cảnh báo `sắp hết` và `tạm hết`

### 4. Thanh toán

- tính tiền giờ chơi
- tính giá theo khung giờ linh hoạt
- áp dụng combo
- phụ thu và giảm giá
- copy nhanh nội dung hóa đơn
- xuất thông tin thanh toán

### 5. Membership

- nhập số điện thoại khi thanh toán
- tự tạo hoặc cập nhật member
- lưu tổng chi tiêu, tổng giờ chơi, hạng thành viên
- cấu hình mốc hạng membership
- xem lịch sử thanh toán của member

### 6. QR Order tại bàn

- route mobile: `/table/{tableId}`
- khách xem menu và gửi order bằng điện thoại
- order vào trạng thái chờ duyệt
- nhân viên duyệt mới cộng bill
- có chống spam cơ bản khi gửi liên tiếp

### 7. Dashboard và báo cáo

- dashboard điều hành
- theo dõi tỷ lệ lấp đầy
- bàn đang phục vụ
- món bán nổi bật
- báo cáo doanh thu
- hiệu suất bàn
- tìm kiếm và lọc báo cáo

## Giao diện hệ thống

Các màn hình chính:

- `index.html`: đăng nhập
- `dashboard.html`: dashboard điều hành
- `tables.html`: quản lý bàn
- `menu.html`: sản phẩm và kho
- `customers.html`: membership
- `reports.html`: báo cáo
- `settings.html`: cài đặt
- `table-order.html`: giao diện QR Order trên điện thoại

## Cấu trúc thư mục

```text
webnangcao/
|-- BidaCSharp/
|   |-- Controllers/
|   |-- Data/
|   |-- Hubs/
|   |-- Models/
|   |-- Services/
|   |-- wwwroot/
|   |   |-- css/
|   |   |-- js/
|   |   |-- images/
|   |   |-- *.html
|   |-- appsettings.json
|   |-- schema.sql
|   `-- BidaCSharp.csproj
|-- postman/
|-- run.bat
|-- seed.sql
`-- README.md
```

## Yêu cầu môi trường

- Windows 10/11
- .NET SDK 9
- MySQL hoặc Laragon
- VS Code hoặc Visual Studio

## Cách chạy dự án

### Cách 1. Chạy nhanh bằng script

Tại thư mục gốc:

```powershell
.\run.bat
```

Script sẽ:

- chuyển vào thư mục `BidaCSharp`
- chạy ứng dụng tại cổng `5289`
- mở trình duyệt tại `http://localhost:5289`

### Cách 2. Chạy bằng lệnh dotnet

```powershell
cd .\BidaCSharp
dotnet run
```

Sau đó truy cập:

- `http://localhost:5289`

## Cấu hình cơ sở dữ liệu

File cấu hình chính:

- [D:\HocTap\webnangcao\BidaCSharp\appsettings.json](D:\HocTap\webnangcao\BidaCSharp\appsettings.json)

Mặc định dự án hỗ trợ 2 cách:

### 1. Dùng MySQL local runtime trong project

Dự án có sẵn service khởi động MySQL local ở cổng `3307`.

### 2. Dùng Laragon hoặc MySQL ngoài

Sửa `appsettings.json`:

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

Sau đó import file:

- [D:\HocTap\webnangcao\BidaCSharp\schema.sql](D:\HocTap\webnangcao\BidaCSharp\schema.sql)

## Tài khoản và phân quyền

Hệ thống có 2 vai trò:

- `admin`: toàn quyền quản trị
- `staff`: quyền vận hành giới hạn

Tài khoản nhân viên được tạo và quản lý trong phần `Cài đặt`.

## API và realtime

Một số nhóm API chính:

- `/api/login`
- `/api/me`
- `/api/tables`
- `/api/sessions`
- `/api/orders`
- `/api/payments`
- `/api/menu-items`
- `/api/inventory-items`
- `/api/customers`
- `/api/staff-users`
- `/api/table-qr-orders`

SignalR hub:

- `/hubs/operations`

Health check:

- `/health`

## Demo QR Order

Link gọi món tại bàn:

```text
/table/{tableId}
```

Ví dụ:

```text
http://localhost:5289/table/1
```

## Hướng dẫn deploy

### Deploy nhanh để demo

Cách phù hợp để demo:

1. chạy app trên máy local
2. chạy database local
3. public bằng Cloudflare Tunnel

Ví dụ:

```powershell
cloudflared tunnel --url http://localhost:5289
```

### Publish bản release

```powershell
cd .\BidaCSharp
dotnet publish -c Release -o .\publish
```

Thư mục deploy:

- `BidaCSharp/publish`

## Kiểm thử nhanh trước khi demo

- kiểm tra trang đăng nhập mở được
- kiểm tra mở bàn và đóng bàn
- kiểm tra gọi món
- kiểm tra thanh toán
- kiểm tra membership bằng số điện thoại
- kiểm tra QR Order trên điện thoại
- kiểm tra báo cáo và dashboard

## Định hướng phát triển thêm

- tích hợp in hóa đơn trực tiếp
- thống kê sâu theo ca làm việc
- đồng bộ nhiều chi nhánh
- nâng cấp membership sang đổi quà hoặc quy đổi ưu đãi
- triển khai production với domain cố định

## Ghi chú

- Dự án phục vụ mục đích học tập, báo cáo và demo đồ án.
- Một số cấu hình cục bộ có thể cần điều chỉnh lại theo máy sử dụng.
