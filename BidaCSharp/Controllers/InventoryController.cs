using BidaCSharp.Data;
using BidaCSharp.Models;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class InventoryController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;

    public InventoryController(MySqlConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    [HttpGet("inventory-items")]
    public async Task<IActionResult> GetInventoryItems()
    {
        using var connection = _connectionFactory.CreateConnection();
        var items = await connection.QueryAsync<inventory_item_record>(@"
            SELECT *
            FROM inventory_items
            WHERE active = 1
            ORDER BY
                CASE WHEN current_stock <= min_stock THEN 0 ELSE 1 END,
                name ASC");
        return Ok(items);
    }

    [Authorize(Roles = "admin")]
    [HttpPost("inventory-items")]
    public async Task<IActionResult> CreateInventoryItem([FromBody] inventory_item_request request)
    {
        if (string.IsNullOrWhiteSpace(request.name) || string.IsNullOrWhiteSpace(request.unit))
        {
            return ApiError("name và unit là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var id = await connection.ExecuteScalarAsync<int>(@"
            INSERT INTO inventory_items (name, unit, current_stock, min_stock)
            VALUES (@name, @unit, @current_stock, @min_stock);
            SELECT LAST_INSERT_ID();",
            new
            {
                name = request.name.Trim(),
                unit = request.unit.Trim(),
                current_stock = request.current_stock ?? 0,
                min_stock = request.min_stock ?? 0
            });

        var item = await connection.QueryFirstAsync<inventory_item_record>(
            "SELECT * FROM inventory_items WHERE id = @id",
            new { id });
        return StatusCode(201, item);
    }

    [Authorize(Roles = "admin")]
    [HttpPut("inventory-items/{id:int}")]
    public async Task<IActionResult> UpdateInventoryItem(int id, [FromBody] inventory_item_request request)
    {
        if (string.IsNullOrWhiteSpace(request.name) || string.IsNullOrWhiteSpace(request.unit))
        {
            return ApiError("name và unit là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(@"
            UPDATE inventory_items
            SET name = @name,
                unit = @unit,
                current_stock = @current_stock,
                min_stock = @min_stock
            WHERE id = @id",
            new
            {
                id,
                name = request.name.Trim(),
                unit = request.unit.Trim(),
                current_stock = request.current_stock ?? 0,
                min_stock = request.min_stock ?? 0
            });

        var item = await connection.QueryFirstAsync<inventory_item_record>(
            "SELECT * FROM inventory_items WHERE id = @id",
            new { id });
        return Ok(item);
    }

    [Authorize(Roles = "admin")]
    [HttpPost("inventory-items/{id:int}/adjust")]
    public async Task<IActionResult> AdjustInventory(int id, [FromBody] inventory_adjust_request request)
    {
        if (request.quantity_change == 0)
        {
            return ApiError("quantity_change phải khác 0", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var item = await connection.QueryFirstOrDefaultAsync<inventory_item_record>(
            "SELECT * FROM inventory_items WHERE id = @id AND active = 1",
            new { id },
            transaction);

        if (item is null)
        {
            return ApiError("Không tìm thấy nguyên liệu", 404);
        }

        var afterStock = item.current_stock + request.quantity_change;
        if (afterStock < 0)
        {
            return ApiError("Tồn kho không đủ để trừ", 400);
        }

        await connection.ExecuteAsync(
            "UPDATE inventory_items SET current_stock = @current_stock WHERE id = @id",
            new { current_stock = afterStock, id },
            transaction);

        await connection.ExecuteAsync(@"
            INSERT INTO inventory_transactions (
                inventory_item_id, transaction_type, quantity_change, stock_before, stock_after, note, created_by)
            VALUES (
                @inventory_item_id, @transaction_type, @quantity_change, @stock_before, @stock_after, @note, @created_by)",
            new
            {
                inventory_item_id = id,
                transaction_type = request.quantity_change > 0 ? "import" : "manual_adjustment",
                quantity_change = request.quantity_change,
                stock_before = item.current_stock,
                stock_after = afterStock,
                note = request.note,
                created_by = current_user.id
            },
            transaction);

        transaction.Commit();
        return Ok(new { message = "Đã cập nhật tồn kho", current_stock = afterStock });
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("inventory-items/{id:int}")]
    public async Task<IActionResult> DeleteInventoryItem(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync("UPDATE inventory_items SET active = 0 WHERE id = @id", new { id });
        return Ok(new { message = "Đã ẩn nguyên liệu khỏi kho" });
    }
}
