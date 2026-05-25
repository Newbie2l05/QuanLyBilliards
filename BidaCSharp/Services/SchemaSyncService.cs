using BidaCSharp.Data;
using Dapper;

namespace BidaCSharp.Services;

public sealed class SchemaSyncService : IHostedService
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly ILogger<SchemaSyncService> _logger;

    public SchemaSyncService(MySqlConnectionFactory connectionFactory, ILogger<SchemaSyncService> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var connection = _connectionFactory.CreateConnection();
            await connection.OpenAsync(cancellationToken);

            async Task EnsureColumnAsync(string tableName, string columnName, string definition)
            {
                var exists = await connection.ExecuteScalarAsync<int>(
                    """
                    SELECT COUNT(*)
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
                    """,
                    new { tableName, columnName });

                if (exists == 0)
                {
                    await connection.ExecuteAsync($"ALTER TABLE `{tableName}` ADD COLUMN {definition};");
                }
            }

            async Task EnsureTableUtf8mb4Async(string tableName)
            {
                var tableCollation = await connection.ExecuteScalarAsync<string?>(
                    """
                    SELECT TABLE_COLLATION
                    FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName
                    """,
                    new { tableName });

                if (!string.Equals(tableCollation, "utf8mb4_unicode_ci", StringComparison.OrdinalIgnoreCase))
                {
                    await connection.ExecuteAsync($"ALTER TABLE `{tableName}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
                }
            }

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS inventory_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    unit VARCHAR(30) NOT NULL DEFAULT 'don_vi',
                    current_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
                    min_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                );
                """);

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS menu_item_inventory (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    menu_item_id INT NOT NULL,
                    inventory_item_id INT NOT NULL,
                    quantity_required DECIMAL(12,2) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_menu_inventory (menu_item_id, inventory_item_id),
                    CONSTRAINT fk_menu_inventory_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
                    CONSTRAINT fk_menu_inventory_inventory_item FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
                );
                """);

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS inventory_transactions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    inventory_item_id INT NOT NULL,
                    transaction_type ENUM('import','sale','manual_adjustment','order_revert') NOT NULL,
                    quantity_change DECIMAL(12,2) NOT NULL,
                    stock_before DECIMAL(12,2) NOT NULL,
                    stock_after DECIMAL(12,2) NOT NULL,
                    reference_type VARCHAR(50) DEFAULT NULL,
                    reference_id INT DEFAULT NULL,
                    note TEXT,
                    created_by INT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_inventory_tx_item FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
                    CONSTRAINT fk_inventory_tx_user FOREIGN KEY (created_by) REFERENCES users(id)
                );
                """);

            await EnsureColumnAsync("menu_items", "description", "description TEXT NULL AFTER unit");
            await EnsureColumnAsync("menu_items", "image_url", "image_url VARCHAR(500) NULL AFTER description");
            await EnsureColumnAsync("order_items", "note", "note TEXT NULL AFTER quantity");
            await EnsureColumnAsync("payments", "customer_id", "customer_id INT NULL AFTER note");
            await EnsureColumnAsync("payments", "customer_phone", "customer_phone VARCHAR(20) NULL AFTER customer_id");
            await EnsureColumnAsync("payments", "customer_rank", "customer_rank VARCHAR(30) NULL AFTER customer_phone");
            await EnsureColumnAsync("payments", "membership_points_earned", "membership_points_earned INT NOT NULL DEFAULT 0 AFTER customer_rank");
            await EnsureColumnAsync("customers", "total_play_minutes", "total_play_minutes INT NOT NULL DEFAULT 0 AFTER total_spent");

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS table_order_requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    table_id INT NOT NULL,
                    session_id INT NOT NULL,
                    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
                    total_quantity INT NOT NULL DEFAULT 0,
                    request_note TEXT DEFAULT NULL,
                    customer_ip VARCHAR(64) DEFAULT NULL,
                    user_agent VARCHAR(255) DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reviewed_at DATETIME DEFAULT NULL,
                    reviewed_by INT DEFAULT NULL,
                    CONSTRAINT fk_table_order_request_table FOREIGN KEY (table_id) REFERENCES `tables`(id),
                    CONSTRAINT fk_table_order_request_session FOREIGN KEY (session_id) REFERENCES sessions(id),
                    CONSTRAINT fk_table_order_request_user FOREIGN KEY (reviewed_by) REFERENCES users(id)
                );
                """);

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS table_order_request_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    request_id INT NOT NULL,
                    menu_item_id INT NOT NULL,
                    item_name VARCHAR(100) NOT NULL,
                    item_price DECIMAL(10,0) NOT NULL,
                    quantity INT NOT NULL DEFAULT 1,
                    note TEXT DEFAULT NULL,
                    subtotal DECIMAL(12,0) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_table_order_request_item_request FOREIGN KEY (request_id) REFERENCES table_order_requests(id),
                    CONSTRAINT fk_table_order_request_item_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
                );
                """);

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS customers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone VARCHAR(20) NOT NULL UNIQUE,
                    full_name VARCHAR(120) DEFAULT NULL,
                    rank_name VARCHAR(30) NOT NULL DEFAULT 'Member',
                    points INT NOT NULL DEFAULT 0,
                    total_spent DECIMAL(14,0) NOT NULL DEFAULT 0,
                    total_play_minutes INT NOT NULL DEFAULT 0,
                    total_visits INT NOT NULL DEFAULT 0,
                    last_played_at DATETIME DEFAULT NULL,
                    note TEXT DEFAULT NULL,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                );
                """);

            await connection.ExecuteAsync("""
                CREATE TABLE IF NOT EXISTS membership_points_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    customer_id INT NOT NULL,
                    payment_id INT DEFAULT NULL,
                    points_delta INT NOT NULL,
                    points_after INT NOT NULL,
                    reason VARCHAR(80) NOT NULL,
                    note TEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_membership_history_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
                    CONSTRAINT fk_membership_history_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
                );
                """);

            await EnsureTableUtf8mb4Async("users");

            _logger.LogInformation("Supplemental schema sync completed.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync supplemental schema.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
