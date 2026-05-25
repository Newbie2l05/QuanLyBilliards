USE billiard_club;

-- 1. Xóa dữ liệu tồn kho cũ để seed lại từ đầu (nếu có)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE menu_item_inventory;
TRUNCATE TABLE inventory_transactions;
TRUNCATE TABLE inventory_items;
SET FOREIGN_KEY_CHECKS = 1;

-- 2. Thêm danh sách nguyên liệu (Inventory Items)
INSERT INTO inventory_items (id, name, unit, current_stock, min_stock, active) VALUES
-- Nước đóng chai/lon (Id 1 -> 8)
(1, 'Nước suối', 'chai', 100, 24, 1),
(2, 'Coca Cola', 'lon', 120, 24, 1),
(3, 'Pepsi', 'lon', 120, 24, 1),
(4, 'Sting', 'lon', 96, 24, 1),
(5, 'Red Bull', 'lon', 48, 12, 1),
(6, 'Bia Tiger', 'lon', 240, 48, 1),
(7, 'Bia Heineken', 'lon', 120, 48, 1),
(8, 'Bia Saigon', 'lon', 240, 48, 1),

-- Nguyên liệu pha chế (Pha trà, cafe)
(9, 'Trà khô', 'g', 1000, 200, 1),
(10, 'Cà phê bột', 'g', 2000, 500, 1),
(11, 'Sữa đặc', 'g', 1000, 300, 1),

-- Đồ ăn vặt
(12, 'Mì tôm (gói)', 'gói', 100, 20, 1),
(13, 'Đậu phộng', 'gói', 50, 10, 1),
(14, 'Xúc xích', 'cây', 50, 10, 1),
(15, 'Khô bò', 'gói', 30, 5, 1),

-- Thuốc lá
(17, 'Thuốc Jet', 'gói', 50, 10, 1),
(18, 'Thuốc Esse', 'gói', 20, 5, 1),
(19, 'Thuốc Marlboro', 'gói', 20, 5, 1),
(20, 'Thuốc Bastos', 'gói', 20, 5, 1),

-- Phụ kiện
(21, 'Phấn bi-a', 'viên', 100, 20, 1),
(22, 'Găng tay', 'đôi', 100, 20, 1);

-- 3. Gắn định lượng cho Menu (Menu Item Inventory)
INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_required) VALUES
-- Nước suối & Nước ngọt
(1, 1, 1), -- Nuoc suoi -> 1 chai
(2, 2, 1), -- Coca -> 1 lon
(3, 3, 1), -- Pepsi -> 1 lon
(4, 4, 1), -- Sting -> 1 lon
(5, 5, 1), -- Red Bull -> 1 lon
(6, 6, 1), -- Bia Tiger -> 1 lon
(7, 7, 1), -- Bia Heineken -> 1 lon
(8, 8, 1), -- Bia Saigon -> 1 lon

-- Pha chế: Trà đá (10g trà)
(9, 9, 10),
-- Pha chế: Cafe đen (25g cafe)
(10, 10, 25),
-- Pha chế: Cafe sữa (25g cafe + 30g sữa đặc)
(11, 10, 25),
(11, 11, 30),

-- Đồ ăn
(12, 12, 1), -- Mi tom -> 1 gói
(13, 13, 1), -- Dau phong (phan) -> 1 gói
(16, 13, 1), -- Dau phong (dia) -> 1 gói
(14, 14, 1), -- Xuc xich -> 1 cây
(15, 15, 1), -- Kho bo -> 1 gói

-- Thuốc lá
(17, 17, 1),
(18, 18, 1),
(19, 19, 1),
(20, 20, 1),

-- Phụ kiện
(21, 21, 1),
(22, 22, 1);
