-- Billiard Club Management System - Database Schema
-- MySQL

CREATE DATABASE IF NOT EXISTS billiard_club CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE billiard_club;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
    description TEXT DEFAULT NULL,
    image_url VARCHAR(500) DEFAULT NULL,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Billiard tables
CREATE TABLE `tables` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    type ENUM('standard', 'vip') NOT NULL DEFAULT 'standard',
    price_per_hour DECIMAL(10,0) NOT NULL DEFAULT 60000,
    combo_price_1 DECIMAL(12,0) DEFAULT NULL,
    combo_price_2 DECIMAL(12,0) DEFAULT NULL,
    combo_price_3 DECIMAL(12,0) DEFAULT NULL,
    combo_prices TEXT DEFAULT NULL,
    status ENUM('available', 'playing', 'reserved') NOT NULL DEFAULT 'available',
    position_order INT DEFAULT 0,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Play sessions
CREATE TABLE sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    combo_id INT DEFAULT NULL,
    combo_name VARCHAR(100) DEFAULT NULL,
    combo_hours INT DEFAULT NULL,
    combo_price DECIMAL(12,0) DEFAULT NULL,
    combo_gift_type ENUM('drink', 'cue') DEFAULT NULL,
    combo_gift_item_id INT DEFAULT NULL,
    combo_gift_name VARCHAR(150) DEFAULT NULL,
    end_time DATETIME DEFAULT NULL,
    total_minutes INT DEFAULT 0,
    total_amount DECIMAL(12,0) DEFAULT 0,
    status ENUM('active', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES `tables`(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Table transfers
CREATE TABLE table_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    from_table_id INT NOT NULL,
    to_table_id INT NOT NULL,
    transferred_at DATETIME NOT NULL,
    transferred_by INT,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (from_table_id) REFERENCES `tables`(id),
    FOREIGN KEY (to_table_id) REFERENCES `tables`(id),
    FOREIGN KEY (transferred_by) REFERENCES users(id)
);

-- Session merges (for merging multiple tables into one session)
CREATE TABLE session_merges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    primary_session_id INT NOT NULL,
    merged_session_id INT NOT NULL,
    merged_at DATETIME NOT NULL,
    merged_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_session_id) REFERENCES sessions(id),
    FOREIGN KEY (merged_session_id) REFERENCES sessions(id),
    FOREIGN KEY (merged_by) REFERENCES users(id)
);

-- Menu categories
CREATE TABLE menu_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'bi-tag',
    sort_order INT DEFAULT 0,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Menu items
CREATE TABLE menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,0) NOT NULL,
    unit VARCHAR(30) DEFAULT 'cái',
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id)
);

-- Inventory items
CREATE TABLE inventory_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'đơn vị',
    current_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
    min_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Recipe mapping between menu item and inventory
CREATE TABLE menu_item_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    menu_item_id INT NOT NULL,
    inventory_item_id INT NOT NULL,
    quantity_required DECIMAL(12,2) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_menu_inventory (menu_item_id, inventory_item_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
);

-- Inventory transactions
CREATE TABLE inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_item_id INT NOT NULL,
    transaction_type ENUM('import', 'sale', 'manual_adjustment', 'order_revert') NOT NULL,
    quantity_change DECIMAL(12,2) NOT NULL,
    stock_before DECIMAL(12,2) NOT NULL,
    stock_after DECIMAL(12,2) NOT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    reference_id INT DEFAULT NULL,
    note TEXT,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Orders
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    total_amount DECIMAL(12,0) DEFAULT 0,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Order items
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_price DECIMAL(10,0) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    note TEXT DEFAULT NULL,
    subtotal DECIMAL(12,0) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Pending QR orders from customers at the table
CREATE TABLE table_order_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_id INT NOT NULL,
    session_id INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    total_quantity INT NOT NULL DEFAULT 0,
    request_note TEXT DEFAULT NULL,
    customer_ip VARCHAR(64) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME DEFAULT NULL,
    reviewed_by INT DEFAULT NULL,
    FOREIGN KEY (table_id) REFERENCES `tables`(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE table_order_request_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_price DECIMAL(10,0) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    note TEXT DEFAULT NULL,
    subtotal DECIMAL(12,0) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES table_order_requests(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Surcharges definition
CREATE TABLE surcharges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('fixed', 'percentage') NOT NULL DEFAULT 'fixed',
    value DECIMAL(10,2) NOT NULL DEFAULT 0,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Surcharges applied to sessions
CREATE TABLE session_surcharges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    surcharge_id INT,
    name VARCHAR(100) NOT NULL,
    type ENUM('fixed', 'percentage') NOT NULL DEFAULT 'fixed',
    value DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,0) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (surcharge_id) REFERENCES surcharges(id)
);

-- Payments
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    table_name VARCHAR(50),
    start_time DATETIME,
    end_time DATETIME,
    play_duration INT DEFAULT 0,
    play_amount DECIMAL(12,0) DEFAULT 0,
    order_amount DECIMAL(12,0) DEFAULT 0,
    surcharge_amount DECIMAL(12,0) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,0) DEFAULT 0,
    total_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
    payment_method ENUM('cash', 'transfer', 'card') DEFAULT 'cash',
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Reservations
CREATE TABLE reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_id INT NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20),
    reserved_time DATETIME NOT NULL,
    note TEXT,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES `tables`(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Settings
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
