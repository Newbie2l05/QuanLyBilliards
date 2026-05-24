using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class OrdersController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly InventoryService _inventoryService;

    public OrdersController(
        MySqlConnectionFactory connectionFactory,
        IRealtimeNotifier realtimeNotifier,
        InventoryService inventoryService)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
        _inventoryService = inventoryService;
    }

    [HttpPost("order")]
    public async Task<IActionResult> AddToOrder([FromBody] order_request request)
    {
        if (request.session_id is null || request.menu_item_id is null)
        {
            return ApiError("session_id và menu_item_id là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var session = await connection.QueryFirstOrDefaultAsync<session_record>(
            "SELECT * FROM sessions WHERE id = @id AND status = 'active'",
            new { id = request.session_id },
            transaction);
        if (session is null)
        {
            return ApiError("Session không hoạt động", 400);
        }

        var menuItem = await connection.QueryFirstOrDefaultAsync<menu_item_record>(
            "SELECT * FROM menu_items WHERE id = @id AND active = 1",
            new { id = request.menu_item_id },
            transaction);
        if (menuItem is null)
        {
            return ApiError("Món không tồn tại", 400);
        }

        var quantity = request.quantity.GetValueOrDefault(1);
        var subtotal = menuItem.price * quantity;
        var order = await connection.QueryFirstOrDefaultAsync<order_record>(
            "SELECT * FROM orders WHERE session_id = @session_id AND status = 'active'",
            new { session_id = request.session_id },
            transaction);

        int orderId;
        if (order is null)
        {
            orderId = await connection.ExecuteScalarAsync<int>(@"
                INSERT INTO orders (session_id, created_by) VALUES (@session_id, @created_by);
                SELECT LAST_INSERT_ID();",
                new { session_id = request.session_id, created_by = current_user.id },
                transaction);
        }
        else
        {
            orderId = order.id;
        }

        var existingItem = await connection.QueryFirstOrDefaultAsync<order_item_record>(
            "SELECT * FROM order_items WHERE order_id = @order_id AND menu_item_id = @menu_item_id",
            new { order_id = orderId, menu_item_id = request.menu_item_id },
            transaction);

        if (existingItem is null)
        {
            await connection.ExecuteAsync(@"
                INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, subtotal)
                VALUES (@order_id, @menu_item_id, @item_name, @item_price, @quantity, @subtotal)",
                new
                {
                    order_id = orderId,
                    menu_item_id = request.menu_item_id,
                    item_name = menuItem.name,
                    item_price = menuItem.price,
                    quantity,
                    subtotal
                },
                transaction);
        }
        else
        {
            var newQuantity = existingItem.quantity + quantity;
            await connection.ExecuteAsync(
                "UPDATE order_items SET quantity = @quantity, subtotal = @subtotal WHERE id = @id",
                new
                {
                    quantity = newQuantity,
                    subtotal = menuItem.price * newQuantity,
                    id = existingItem.id
                },
                transaction);
        }

        await _inventoryService.ApplyOrderDeltaAsync(
            connection,
            transaction,
            request.menu_item_id.Value,
            quantity,
            current_user.id,
            "order",
            orderId,
            $"Gọi món cho bàn #{session.table_id}");

        var total = await connection.ExecuteScalarAsync<decimal>(
            "SELECT COALESCE(SUM(subtotal), 0) FROM order_items WHERE order_id = @order_id",
            new { order_id = orderId },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE orders SET total_amount = @total_amount WHERE id = @id",
            new { total_amount = total, id = orderId },
            transaction);

        var items = await connection.QueryAsync<order_item_record>(
            "SELECT * FROM order_items WHERE order_id = @order_id ORDER BY created_at",
            new { order_id = orderId },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.OrderUpdatedAsync(request.session_id.Value, orderId);
        return Ok(new { order_id = orderId, items, total });
    }

    [HttpGet("order/{session_id:int}")]
    public async Task<IActionResult> GetOrder(int session_id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var order = await connection.QueryFirstOrDefaultAsync<order_record>(
            "SELECT * FROM orders WHERE session_id = @session_id AND status = 'active'",
            new { session_id });

        if (order is null)
        {
            return Ok(new { order_id = (int?)null, items = Array.Empty<order_item_record>(), total = 0 });
        }

        var items = await connection.QueryAsync<order_item_record>(
            "SELECT * FROM order_items WHERE order_id = @order_id ORDER BY created_at",
            new { order_id = order.id });
        return Ok(new { order_id = order.id, items, total = order.total_amount });
    }

    [HttpPut("order-item/{id:int}")]
    public async Task<IActionResult> UpdateOrderItem(int id, [FromBody] quantity_request request)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var item = await connection.QueryFirstOrDefaultAsync<order_item_record>(
            "SELECT * FROM order_items WHERE id = @id",
            new { id },
            transaction);
        if (item is null)
        {
            return ApiError("Item không tồn tại", 404);
        }

        var sessionId = await connection.ExecuteScalarAsync<int>(
            "SELECT session_id FROM orders WHERE id = @order_id",
            new { order_id = item.order_id },
            transaction);

        if (request.quantity <= 0)
        {
            await connection.ExecuteAsync("DELETE FROM order_items WHERE id = @id", new { id }, transaction);
            await _inventoryService.ApplyOrderDeltaAsync(
                connection,
                transaction,
                item.menu_item_id,
                -item.quantity,
                current_user.id,
                "order-item-delete",
                id,
                "Hoàn kho do xóa món");
        }
        else
        {
            var delta = request.quantity - item.quantity;
            await connection.ExecuteAsync(
                "UPDATE order_items SET quantity = @quantity, subtotal = @subtotal WHERE id = @id",
                new
                {
                    id,
                    quantity = request.quantity,
                    subtotal = item.item_price * request.quantity
                },
                transaction);

            await _inventoryService.ApplyOrderDeltaAsync(
                connection,
                transaction,
                item.menu_item_id,
                delta,
                current_user.id,
                "order-item-update",
                id,
                "Điều chỉnh số lượng món");
        }

        var total = await connection.ExecuteScalarAsync<decimal>(
            "SELECT COALESCE(SUM(subtotal), 0) FROM order_items WHERE order_id = @order_id",
            new { order_id = item.order_id },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE orders SET total_amount = @total_amount WHERE id = @id",
            new { total_amount = total, id = item.order_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.OrderUpdatedAsync(sessionId, item.order_id);
        return Ok(new { message = "Cập nhật thành công", total });
    }

    [HttpDelete("order-item/{id:int}")]
    public async Task<IActionResult> DeleteOrderItem(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var item = await connection.QueryFirstOrDefaultAsync<order_item_record>(
            "SELECT * FROM order_items WHERE id = @id",
            new { id },
            transaction);
        if (item is null)
        {
            return ApiError("Item không tồn tại", 404);
        }

        var sessionId = await connection.ExecuteScalarAsync<int>(
            "SELECT session_id FROM orders WHERE id = @order_id",
            new { order_id = item.order_id },
            transaction);

        await connection.ExecuteAsync("DELETE FROM order_items WHERE id = @id", new { id }, transaction);
        await _inventoryService.ApplyOrderDeltaAsync(
            connection,
            transaction,
            item.menu_item_id,
            -item.quantity,
            current_user.id,
            "order-item-delete",
            id,
            "Hoàn kho do xóa món");
        var total = await connection.ExecuteScalarAsync<decimal>(
            "SELECT COALESCE(SUM(subtotal), 0) FROM order_items WHERE order_id = @order_id",
            new { order_id = item.order_id },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE orders SET total_amount = @total_amount WHERE id = @id",
            new { total_amount = total, id = item.order_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.OrderUpdatedAsync(sessionId, item.order_id);
        return Ok(new { message = "Đã xóa món", total });
    }
}
