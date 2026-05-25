USE billiard_club;

-- Reset recipe and inventory data
DELETE FROM menu_item_inventory;
DELETE FROM inventory_transactions;
DELETE FROM inventory_items;
DELETE FROM menu_items;
DELETE FROM menu_categories;

ALTER TABLE menu_categories AUTO_INCREMENT = 1;
ALTER TABLE menu_items AUTO_INCREMENT = 1;
ALTER TABLE inventory_items AUTO_INCREMENT = 1;

-- Default admin user
INSERT INTO users (username, password, full_name, role, active)
VALUES ('admin', '$2b$12$pCyLdv2hTdDijx9TaDDXz.vCGGVpinZauP7LAwAabAOGtve9KqDUi', 'Administrator', 'admin', 1)
ON DUPLICATE KEY UPDATE
    password = VALUES(password),
    full_name = VALUES(full_name),
    role = VALUES(role),
    active = VALUES(active);

-- Menu categories
INSERT INTO menu_categories (id, name, icon, sort_order, active) VALUES
(1, 'Nuoc dong chai', 'bi-cup-straw', 1, 1),
(2, 'Pha che', 'bi-cup-hot', 2, 1),
(3, 'Do an vat', 'bi-egg-fried', 3, 1),
(4, 'Thuoc la', 'bi-fire', 4, 1),
(5, 'Phu kien', 'bi-box-seam', 5, 1);

-- Menu items
INSERT INTO menu_items (id, category_id, name, price, unit, active) VALUES
(1, 1, 'Nuoc suoi', 10000, 'chai', 1),
(2, 1, 'Coca Cola', 15000, 'lon', 1),
(3, 1, 'Pepsi', 15000, 'lon', 1),
(4, 1, 'Sting', 15000, 'lon', 1),
(5, 1, 'Red Bull', 20000, 'lon', 1),
(6, 1, 'Bia Tiger', 25000, 'lon', 1),
(7, 1, 'Bia Heineken', 30000, 'lon', 1),
(8, 1, 'Bia Saigon', 22000, 'lon', 1),
(9, 2, 'Tra da', 10000, 'ly', 1),
(10, 2, 'Cafe den', 18000, 'ly', 1),
(11, 2, 'Cafe sua', 22000, 'ly', 1),
(12, 3, 'Mi tom', 15000, 'goi', 1),
(13, 3, 'Dau phong phan', 10000, 'phan', 1),
(14, 3, 'Xuc xich', 15000, 'cay', 1),
(15, 3, 'Kho bo', 20000, 'goi', 1),
(16, 3, 'Dau phong dia', 20000, 'dia', 1),
(17, 4, 'Thuoc Jet', 25000, 'goi', 1),
(18, 4, 'Thuoc Esse', 30000, 'goi', 1),
(19, 4, 'Thuoc Marlboro', 35000, 'goi', 1),
(20, 4, 'Thuoc Bastos', 25000, 'goi', 1),
(21, 5, 'Phan bi-a', 5000, 'vien', 1),
(22, 5, 'Gang tay', 15000, 'doi', 1);

-- Inventory items
INSERT INTO inventory_items (id, name, unit, current_stock, min_stock, active) VALUES
(1, 'Nuoc suoi', 'chai', 100, 24, 1),
(2, 'Coca Cola', 'lon', 120, 24, 1),
(3, 'Pepsi', 'lon', 120, 24, 1),
(4, 'Sting', 'lon', 96, 24, 1),
(5, 'Red Bull', 'lon', 48, 12, 1),
(6, 'Bia Tiger', 'lon', 240, 48, 1),
(7, 'Bia Heineken', 'lon', 120, 48, 1),
(8, 'Bia Saigon', 'lon', 240, 48, 1),
(9, 'Tra kho', 'g', 1000, 200, 1),
(10, 'Ca phe bot', 'g', 2000, 500, 1),
(11, 'Sua dac', 'g', 1000, 300, 1),
(12, 'Mi tom', 'goi', 100, 20, 1),
(13, 'Dau phong', 'goi', 50, 10, 1),
(14, 'Xuc xich', 'cay', 50, 10, 1),
(15, 'Kho bo', 'goi', 30, 5, 1),
(17, 'Thuoc Jet', 'goi', 50, 10, 1),
(18, 'Thuoc Esse', 'goi', 20, 5, 1),
(19, 'Thuoc Marlboro', 'goi', 20, 5, 1),
(20, 'Thuoc Bastos', 'goi', 20, 5, 1),
(21, 'Phan bi-a', 'vien', 100, 20, 1),
(22, 'Gang tay', 'doi', 100, 20, 1);

-- Recipe mapping
INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_required) VALUES
(1, 1, 1),
(2, 2, 1),
(3, 3, 1),
(4, 4, 1),
(5, 5, 1),
(6, 6, 1),
(7, 7, 1),
(8, 8, 1),
(9, 9, 10),
(10, 10, 25),
(11, 10, 25),
(11, 11, 30),
(12, 12, 1),
(13, 13, 1),
(16, 13, 1),
(14, 14, 1),
(15, 15, 1),
(17, 17, 1),
(18, 18, 1),
(19, 19, 1),
(20, 20, 1),
(21, 21, 1),
(22, 22, 1);
