using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace BidaCSharp.Controllers;

[Route("api")]
public sealed class TableQrOrdersController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly InventoryService _inventoryService;

    public TableQrOrdersController(
        MySqlConnectionFactory connectionFactory,
        IRealtimeNotifier realtimeNotifier,
        InventoryService inventoryService)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
        _inventoryService = inventoryService;
    }

    [AllowAnonymous]
    [HttpGet("public/tables/{tableId:int}/order")]
    public async Task<IActionResult> GetTableOrderPage(int tableId)
    {
        using var connection = _connectionFactory.CreateConnection();

        var table = await connection.QueryFirstOrDefaultAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id AND active = 1",
            new { id = tableId });
        if (table is null)
        {
            return ApiError("Bàn không tồn tại", 404);
        }

        var session = await connection.QueryFirstOrDefaultAsync<session_record>(
            """
            SELECT s.*, t.name AS table_name, t.type AS table_type, t.price_per_hour
            FROM sessions s
            JOIN `tables` t ON t.id = s.table_id
            WHERE s.table_id = @table_id AND s.status = 'active'
            ORDER BY s.id DESC
            LIMIT 1
            """,
            new { table_id = tableId });

        var categories = (await connection.QueryAsync<menu_category_record>(
            "SELECT * FROM menu_categories WHERE active = 1 ORDER BY sort_order")).ToList();
        var items = (await connection.QueryAsync<menu_item_record>(GetMenuListingSql())).ToList();
        var settings = await GetSettingsDictionary(connection);
        var canOrder = session is not null && string.Equals(table.status, "playing", StringComparison.OrdinalIgnoreCase);

        var menu = categories.Select(category => new
        {
            category.id,
            category.name,
            category.icon,
            items = items.Where(item => item.category_id == category.id)
        });

        return Ok(new
        {
            table = new
            {
                table.id,
                table.name,
                table.type,
                table.status
            },
            session = session is null ? null : new
            {
                session.id,
                session.start_time,
                session.combo_name,
                session.combo_hours
            },
            can_order = canOrder,
            reason = canOrder ? null : "Bàn này chưa mở phiên chơi nên chưa thể gọi món.",
            menu,
            settings = new
            {
                club_name = settings.GetValueOrDefault("club_name") ?? "Billiard Club",
                club_phone = settings.GetValueOrDefault("club_phone"),
                club_address = settings.GetValueOrDefault("club_address")
            }
        });
    }

    [AllowAnonymous]
    [HttpPost("public/tables/{tableId:int}/order-requests")]
    public async Task<IActionResult> CreateTableOrderRequest(int tableId, [FromBody] table_order_request_create request)
    {
        var normalizedItems = (request.items ?? [])
            .Where(item => item.menu_item_id.HasValue && item.quantity.GetValueOrDefault() > 0)
            .Select(item => new
            {
                menu_item_id = item.menu_item_id!.Value,
                quantity = Math.Min(20, item.quantity!.Value),
                note = string.IsNullOrWhiteSpace(item.note) ? null : item.note.Trim()
            })
            .GroupBy(item => new { item.menu_item_id, note = item.note ?? string.Empty })
            .Select(group => new
            {
                group.Key.menu_item_id,
                note = string.IsNullOrWhiteSpace(group.Key.note) ? null : group.Key.note,
                quantity = group.Sum(item => item.quantity)
            })
            .Where(item => item.quantity > 0)
            .ToList();

        if (normalizedItems.Count == 0)
        {
            return ApiError("Giỏ hàng đang trống", 400);
        }

        var totalQuantity = normalizedItems.Sum(item => item.quantity);
        if (totalQuantity > 50)
        {
            return ApiError("Số lượng món trong một lần gửi quá lớn", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var table = await connection.QueryFirstOrDefaultAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id AND active = 1",
            new { id = tableId },
            transaction);
        if (table is null)
        {
            return ApiError("Bàn không tồn tại", 404);
        }

        var session = await connection.QueryFirstOrDefaultAsync<session_record>(
            "SELECT * FROM sessions WHERE table_id = @table_id AND status = 'active' ORDER BY id DESC LIMIT 1",
            new { table_id = tableId },
            transaction);
        if (session is null || !string.Equals(table.status, "playing", StringComparison.OrdinalIgnoreCase))
        {
            return ApiError("Bàn chưa active, chưa thể gửi order", 400);
        }

        var customerIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        var spamCount = await connection.ExecuteScalarAsync<int>(
            """
            SELECT COUNT(*)
            FROM table_order_requests
            WHERE table_id = @table_id
              AND session_id = @session_id
              AND COALESCE(customer_ip, '') = COALESCE(@customer_ip, '')
              AND created_at >= DATE_SUB(NOW(), INTERVAL 20 SECOND)
            """,
            new
            {
                table_id = tableId,
                session_id = session.id,
                customer_ip = customerIp
            },
            transaction);
        if (spamCount > 0)
        {
            return StatusCode(429, new { error = "Bạn vừa gửi order. Vui lòng đợi khoảng 20 giây rồi thử lại." });
        }

        var menuItems = (await connection.QueryAsync<menu_item_record>(GetMenuListingSql(), transaction: transaction))
            .ToDictionary(item => item.id, item => item);

        foreach (var item in normalizedItems)
        {
            if (!menuItems.TryGetValue(item.menu_item_id, out var menuItem))
            {
                return ApiError("Có món không còn tồn tại trong menu", 400);
            }

            if (string.Equals(menuItem.inventory_status, "out", StringComparison.OrdinalIgnoreCase))
            {
                return ApiError($"Món {menuItem.name} đang tạm hết", 400);
            }
        }

        var requestId = await connection.ExecuteScalarAsync<int>(
            """
            INSERT INTO table_order_requests (table_id, session_id, status, total_quantity, request_note, customer_ip, user_agent)
            VALUES (@table_id, @session_id, 'pending', @total_quantity, @request_note, @customer_ip, @user_agent);
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                table_id = tableId,
                session_id = session.id,
                total_quantity = totalQuantity,
                request_note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim(),
                customer_ip = customerIp,
                user_agent = Request.Headers.UserAgent.ToString()[..Math.Min(255, Request.Headers.UserAgent.ToString().Length)]
            },
            transaction);

        foreach (var item in normalizedItems)
        {
            var menuItem = menuItems[item.menu_item_id];
            await connection.ExecuteAsync(
                """
                INSERT INTO table_order_request_items (request_id, menu_item_id, item_name, item_price, quantity, note, subtotal)
                VALUES (@request_id, @menu_item_id, @item_name, @item_price, @quantity, @note, @subtotal)
                """,
                new
                {
                    request_id = requestId,
                    menu_item_id = item.menu_item_id,
                    item_name = menuItem.name,
                    item_price = menuItem.price,
                    quantity = item.quantity,
                    note = item.note,
                    subtotal = menuItem.price * item.quantity
                },
                transaction);
        }

        transaction.Commit();
        await _realtimeNotifier.OrderUpdatedAsync(session.id, null);

        return StatusCode(201, new
        {
            request_id = requestId,
            status = "pending",
            message = "Đã gửi order. Nhân viên sẽ xác nhận và cộng vào bill."
        });
    }

    [Authorize]
    [HttpGet("table-order-requests/session/{sessionId:int}")]
    public async Task<IActionResult> GetPendingTableOrderRequests(int sessionId)
    {
        using var connection = _connectionFactory.CreateConnection();
        var requests = (await connection.QueryAsync<table_order_request_record>(
            """
            SELECT *
            FROM table_order_requests
            WHERE session_id = @session_id AND status = 'pending'
            ORDER BY created_at ASC
            """,
            new { session_id = sessionId })).ToList();

        if (requests.Count == 0)
        {
            return Ok(Array.Empty<object>());
        }

        var requestIds = requests.Select(item => item.id).ToArray();
        var items = (await connection.QueryAsync<table_order_request_item_record>(
            "SELECT * FROM table_order_request_items WHERE request_id IN @request_ids ORDER BY id",
            new { request_ids = requestIds }))
            .GroupBy(item => item.request_id)
            .ToDictionary(group => group.Key, group => group.ToList());

        return Ok(requests.Select(item => new
        {
            item.id,
            item.table_id,
            item.session_id,
            item.total_quantity,
            item.request_note,
            item.created_at,
            items = items.GetValueOrDefault(item.id) ?? []
        }));
    }

    [Authorize]
    [HttpGet("table-order-requests/pending-summary")]
    public async Task<IActionResult> GetPendingQrOrderSummary()
    {
        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync(
            """
            SELECT
                r.id,
                r.table_id,
                r.session_id,
                r.total_quantity,
                r.request_note,
                r.created_at,
                t.name AS table_name,
                (
                    SELECT GROUP_CONCAT(CONCAT(i.item_name, ' x', i.quantity) ORDER BY i.id SEPARATOR ', ')
                    FROM table_order_request_items i
                    WHERE i.request_id = r.id
                ) AS items_summary
            FROM table_order_requests r
            JOIN `tables` t ON t.id = r.table_id
            WHERE r.status = 'pending'
            ORDER BY r.created_at DESC
            LIMIT 20
            """);

        return Ok(rows);
    }

    [Authorize]
    [HttpGet("network-info")]
    public IActionResult GetNetworkInfo()
    {
        var localIps = NetworkInterface.GetAllNetworkInterfaces()
            .Where(item =>
                item.OperationalStatus == OperationalStatus.Up &&
                item.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                item.NetworkInterfaceType != NetworkInterfaceType.Tunnel)
            .SelectMany(item => item.GetIPProperties().UnicastAddresses)
            .Where(address =>
                address.Address.AddressFamily == AddressFamily.InterNetwork &&
                !IPAddress.IsLoopback(address.Address))
            .Select(address => address.Address.ToString())
            .Distinct()
            .OrderBy(value => value)
            .ToArray();

        return Ok(new
        {
            local_ips = localIps
        });
    }

    [Authorize]
    [HttpPost("table-order-requests/{id:int}/approve")]
    public async Task<IActionResult> ApproveTableOrderRequest(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var request = await connection.QueryFirstOrDefaultAsync<table_order_request_record>(
            "SELECT * FROM table_order_requests WHERE id = @id AND status = 'pending'",
            new { id },
            transaction);
        if (request is null)
        {
            return ApiError("Không tìm thấy order QR đang chờ duyệt", 404);
        }

        var session = await connection.QueryFirstOrDefaultAsync<session_record>(
            "SELECT * FROM sessions WHERE id = @id AND status = 'active'",
            new { id = request.session_id },
            transaction);
        if (session is null)
        {
            return ApiError("Phiên chơi không còn hoạt động", 400);
        }

        var requestItems = (await connection.QueryAsync<table_order_request_item_record>(
            "SELECT * FROM table_order_request_items WHERE request_id = @request_id ORDER BY id",
            new { request_id = id },
            transaction)).ToList();
        if (requestItems.Count == 0)
        {
            return ApiError("Order QR không có món hợp lệ", 400);
        }

        var order = await connection.QueryFirstOrDefaultAsync<order_record>(
            "SELECT * FROM orders WHERE session_id = @session_id AND status = 'active'",
            new { session_id = session.id },
            transaction);

        var orderId = order?.id ?? await connection.ExecuteScalarAsync<int>(
            """
            INSERT INTO orders (session_id, created_by) VALUES (@session_id, @created_by);
            SELECT LAST_INSERT_ID();
            """,
            new { session_id = session.id, created_by = current_user.id },
            transaction);

        foreach (var item in requestItems)
        {
            var existingItem = await connection.QueryFirstOrDefaultAsync<order_item_record>(
                """
                SELECT *
                FROM order_items
                WHERE order_id = @order_id
                  AND menu_item_id = @menu_item_id
                  AND COALESCE(note, '') = COALESCE(@note, '')
                LIMIT 1
                """,
                new
                {
                    order_id = orderId,
                    menu_item_id = item.menu_item_id,
                    note = item.note
                },
                transaction);

            if (existingItem is null)
            {
                await connection.ExecuteAsync(
                    """
                    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, subtotal)
                    VALUES (@order_id, @menu_item_id, @item_name, @item_price, @quantity, @note, @subtotal)
                    """,
                    new
                    {
                        order_id = orderId,
                        menu_item_id = item.menu_item_id,
                        item_name = item.item_name,
                        item_price = item.item_price,
                        quantity = item.quantity,
                        note = item.note,
                        subtotal = item.item_price * item.quantity
                    },
                    transaction);
            }
            else
            {
                var newQuantity = existingItem.quantity + item.quantity;
                await connection.ExecuteAsync(
                    "UPDATE order_items SET quantity = @quantity, subtotal = @subtotal WHERE id = @id",
                    new
                    {
                        quantity = newQuantity,
                        subtotal = existingItem.item_price * newQuantity,
                        id = existingItem.id
                    },
                    transaction);
            }

            await _inventoryService.ApplyOrderDeltaAsync(
                connection,
                transaction,
                item.menu_item_id,
                item.quantity,
                current_user.id,
                "table-qr-order",
                id,
                $"Duyet QR order #{id} cho ban #{request.table_id}");
        }

        var total = await connection.ExecuteScalarAsync<decimal>(
            "SELECT COALESCE(SUM(subtotal), 0) FROM order_items WHERE order_id = @order_id",
            new { order_id = orderId },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE orders SET total_amount = @total_amount WHERE id = @id",
            new { total_amount = total, id = orderId },
            transaction);

        await connection.ExecuteAsync(
            """
            UPDATE table_order_requests
            SET status = 'approved', reviewed_at = NOW(), reviewed_by = @reviewed_by
            WHERE id = @id
            """,
            new { id, reviewed_by = current_user.id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.OrderUpdatedAsync(session.id, orderId);

        return Ok(new { message = "Đã duyệt order QR và cộng vào bill." });
    }

    [Authorize]
    [HttpPost("table-order-requests/{id:int}/reject")]
    public async Task<IActionResult> RejectTableOrderRequest(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var request = await connection.QueryFirstOrDefaultAsync<table_order_request_record>(
            "SELECT * FROM table_order_requests WHERE id = @id AND status = 'pending'",
            new { id });
        if (request is null)
        {
            return ApiError("Không tìm thấy order QR đang chờ duyệt", 404);
        }

        await connection.ExecuteAsync(
            """
            UPDATE table_order_requests
            SET status = 'rejected', reviewed_at = NOW(), reviewed_by = @reviewed_by
            WHERE id = @id
            """,
            new { id, reviewed_by = current_user.id });

        await _realtimeNotifier.OrderUpdatedAsync(request.session_id, null);
        return Ok(new { message = "Đã từ chối order QR." });
    }

    private static string GetMenuListingSql()
    {
        return
            """
            SELECT
                mi.*,
                mc.name AS category_name,
                COUNT(mii.id) AS recipe_count,
                CASE WHEN COUNT(mii.id) > 0 THEN 1 ELSE 0 END AS has_inventory_recipe,
                MIN(
                    CASE
                        WHEN mii.quantity_required IS NULL OR mii.quantity_required <= 0 THEN NULL
                        ELSE FLOOR(ii.current_stock / mii.quantity_required)
                    END
                ) AS available_stock_estimate,
                CASE
                    WHEN COUNT(mii.id) = 0 THEN 'none'
                    WHEN MIN(
                        CASE
                            WHEN mii.quantity_required IS NULL OR mii.quantity_required <= 0 THEN NULL
                            ELSE FLOOR(ii.current_stock / mii.quantity_required)
                        END
                    ) <= 0 THEN 'out'
                    WHEN MIN(
                        CASE
                            WHEN mii.quantity_required IS NULL OR mii.quantity_required <= 0 THEN NULL
                            ELSE FLOOR(ii.current_stock / mii.quantity_required)
                        END
                    ) <= 5 THEN 'low'
                    ELSE 'ok'
                END AS inventory_status
            FROM menu_items mi
            JOIN menu_categories mc ON mi.category_id = mc.id
            LEFT JOIN menu_item_inventory mii ON mi.id = mii.menu_item_id
            LEFT JOIN inventory_items ii ON ii.id = mii.inventory_item_id
            WHERE mi.active = 1
            GROUP BY mi.id
            ORDER BY mi.category_id, mi.name
            """;
    }

    private static async Task<Dictionary<string, string?>> GetSettingsDictionary(System.Data.IDbConnection connection)
    {
        var settings = await connection.QueryAsync<setting_record>("SELECT * FROM settings");
        return settings.ToDictionary(item => item.setting_key, item => item.setting_value);
    }
}
