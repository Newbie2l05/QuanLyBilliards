using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class TablesController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;

    public TablesController(MySqlConnectionFactory connectionFactory, IRealtimeNotifier realtimeNotifier)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables()
    {
        using var connection = _connectionFactory.CreateConnection();
        var tables = (await connection.QueryAsync<table_record>("SELECT * FROM `tables` WHERE active = 1 ORDER BY position_order, id")).ToList();
        var sessions = (await connection.QueryAsync<session_record>(@"
            SELECT id, table_id, start_time, status, combo_id, combo_name, combo_hours, combo_price, combo_gift_type, combo_gift_name
            FROM sessions
            WHERE status = 'active'"))
            .ToDictionary(item => item.table_id, item => item);

        foreach (var table in tables)
        {
            if (!sessions.TryGetValue(table.id, out var session))
            {
                continue;
            }

            table.session_id = session.id;
            table.start_time = session.start_time;
            table.session_status = session.status;
            table.combo_id = session.combo_id;
            table.combo_name = session.combo_name;
            table.combo_hours = session.combo_hours;
            table.combo_price = session.combo_price;
            table.combo_gift_type = session.combo_gift_type;
            table.combo_gift_name = session.combo_gift_name;
        }

        var activeOrders = (await connection.QueryAsync<(int table_id, string active_order_summary, int active_order_count)>(@"
            SELECT
                s.table_id,
                GROUP_CONCAT(CONCAT(oi.item_name, ' x', oi.quantity) ORDER BY oi.item_name SEPARATOR ', ') AS active_order_summary,
                COALESCE(SUM(oi.quantity), 0) AS active_order_count
            FROM orders o
            JOIN sessions s ON o.session_id = s.id
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.status = 'active' AND s.status = 'active'
            GROUP BY s.table_id"))
            .ToDictionary(item => item.table_id, item => item);

        var pendingReservations = (await connection.QueryAsync<(int table_id, string customer_name, string customer_phone, string note, DateTime reserved_time, int reservation_id)>(@"
            SELECT table_id, customer_name, customer_phone, note, reserved_time, id as reservation_id
            FROM reservations
            WHERE status = 'pending'
            ORDER BY created_at DESC"))
            .GroupBy(item => item.table_id)
            .ToDictionary(group => group.Key, group => group.First());

        foreach (var table in tables)
        {
            if (activeOrders.TryGetValue(table.id, out var activeOrder))
            {
                table.active_order_summary = activeOrder.active_order_summary;
                table.active_order_count = activeOrder.active_order_count;
            }

            if (pendingReservations.TryGetValue(table.id, out var reservation))
            {
                table.reservation_customer_name = reservation.customer_name;
                table.reservation_customer_phone = reservation.customer_phone;
                table.reservation_note = reservation.note;
                table.reservation_time = reservation.reserved_time;
                table.reservation_id = reservation.reservation_id;
            }
        }

        return Ok(tables);
    }

    [Authorize(Roles = "admin")]
    [HttpPost("tables")]
    public async Task<IActionResult> CreateTable([FromBody] table_request request)
    {
        if (string.IsNullOrWhiteSpace(request.name) || request.price_per_hour is null)
        {
            return ApiError("name và price_per_hour là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var id = await connection.ExecuteScalarAsync<int>(@"
            INSERT INTO `tables` (name, type, price_per_hour, position_order)
            VALUES (@name, @type, @price_per_hour, @position_order);
            SELECT LAST_INSERT_ID();",
            new
            {
                name = request.name.Trim(),
                type = string.IsNullOrWhiteSpace(request.type) ? "standard" : request.type,
                price_per_hour = request.price_per_hour,
                position_order = request.position_order ?? 0
            });

        var table = await connection.QueryFirstAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id",
            new { id });

        await _realtimeNotifier.TableUpdatedAsync(id);
        return StatusCode(201, table);
    }

    [Authorize(Roles = "admin")]
    [HttpPut("tables/{id:int}")]
    public async Task<IActionResult> UpdateTable(int id, [FromBody] table_request request)
    {
        if (string.IsNullOrWhiteSpace(request.name) || request.price_per_hour is null)
        {
            return ApiError("name và price_per_hour là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(@"
            UPDATE `tables`
            SET name = @name, type = @type, price_per_hour = @price_per_hour, position_order = @position_order
            WHERE id = @id AND active = 1",
            new
            {
                id,
                name = request.name.Trim(),
                type = string.IsNullOrWhiteSpace(request.type) ? "standard" : request.type,
                price_per_hour = request.price_per_hour,
                position_order = request.position_order ?? 0
            });

        var table = await connection.QueryFirstAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id",
            new { id });

        await _realtimeNotifier.TableUpdatedAsync(id);
        return Ok(table);
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("tables/{id:int}")]
    public async Task<IActionResult> DeleteTable(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var table = await connection.QueryFirstOrDefaultAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id AND active = 1",
            new { id });

        if (table is null)
        {
            return ApiError("Bàn không tồn tại", 404);
        }

        if (!string.Equals(table.status, "available", StringComparison.OrdinalIgnoreCase))
        {
            return ApiError("Chỉ xóa được bàn đang trống", 400);
        }

        await connection.ExecuteAsync("UPDATE `tables` SET active = 0 WHERE id = @id", new { id });
        await _realtimeNotifier.TableUpdatedAsync(id);
        return Ok(new { message = "Đã xóa bàn" });
    }
}
