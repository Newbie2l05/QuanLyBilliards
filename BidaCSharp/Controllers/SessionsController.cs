using System.Text.Json;
using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class SessionsController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly PricingService _pricingService;
    private readonly InventoryService _inventoryService;

    public SessionsController(
        MySqlConnectionFactory connectionFactory,
        IRealtimeNotifier realtimeNotifier,
        PricingService pricingService,
        InventoryService inventoryService)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
        _pricingService = pricingService;
        _inventoryService = inventoryService;
    }

    [HttpPost("start-session")]
    public async Task<IActionResult> StartSession([FromBody] start_session_request request)
    {
        if (request.table_id is null)
        {
            return ApiError("table_id là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var table = await connection.QueryFirstOrDefaultAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id AND status = 'available' AND active = 1",
            new { id = request.table_id });

        if (table is null)
        {
            return ApiError("Bàn không khả dụng", 400);
        }

        decimal? effectiveComboPrice = null;
        int? normalizedComboId = request.combo_id;

        if (normalizedComboId.HasValue)
        {
            var comboRaw = await connection.ExecuteScalarAsync<string?>(
                "SELECT setting_value FROM settings WHERE setting_key = 'combo_configs' LIMIT 1");

            if (!string.IsNullOrWhiteSpace(comboRaw))
            {
                using var doc = JsonDocument.Parse(comboRaw);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        if (item.TryGetProperty("id", out var idProp) && idProp.GetInt32() == normalizedComboId.Value)
                        {
                            if (item.TryGetProperty("prices", out var pricesProp) &&
                                pricesProp.TryGetProperty(table.type, out var priceProp))
                            {
                                effectiveComboPrice = priceProp.GetDecimal();
                            }
                        }
                    }
                }
            }

            if (!effectiveComboPrice.HasValue || effectiveComboPrice.Value <= 0)
            {
                return ApiError("Combo chưa được cấu hình giá cho loại bàn này", 400);
            }
        }

        var now = DateTime.Now;
        var id = await connection.ExecuteScalarAsync<int>(@"
            INSERT INTO sessions (
                table_id, start_time, combo_id, combo_name, combo_hours, combo_price,
                combo_gift_type, combo_gift_item_id, combo_gift_name, created_by)
            VALUES (
                @table_id, @start_time, @combo_id, @combo_name, @combo_hours, @combo_price,
                @combo_gift_type, @combo_gift_item_id, @combo_gift_name, @created_by);
            SELECT LAST_INSERT_ID();",
            new
            {
                table_id = request.table_id,
                start_time = now,
                combo_id = normalizedComboId,
                combo_name = request.combo_name,
                combo_hours = request.combo_hours,
                combo_price = effectiveComboPrice,
                combo_gift_type = request.combo_gift_type,
                combo_gift_item_id = request.combo_gift_item_id,
                combo_gift_name = request.combo_gift_name,
                created_by = current_user.id
            });

        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'playing' WHERE id = @id",
            new { id = request.table_id });

        var session = await connection.QueryFirstAsync<session_record>(
            "SELECT * FROM sessions WHERE id = @id",
            new { id });

        await _realtimeNotifier.TableUpdatedAsync(request.table_id);
        return StatusCode(201, session);
    }

    [HttpGet("session/{id:int}")]
    public async Task<IActionResult> GetSession(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var session = await connection.QueryFirstOrDefaultAsync<session_record>(@"
            SELECT s.*, t.name AS table_name, t.price_per_hour, t.type AS table_type
            FROM sessions s
            JOIN `tables` t ON s.table_id = t.id
            WHERE s.id = @id",
            new { id });

        if (session is null)
        {
            return ApiError("Session không tồn tại", 404);
        }

        return Ok(session);
    }

    [HttpPost("sessions/{id:int}/cancel")]
    public async Task<IActionResult> CancelSession(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var session = await connection.QueryFirstOrDefaultAsync<session_record>(
            "SELECT * FROM sessions WHERE id = @id AND status = 'active'",
            new { id },
            transaction);

        if (session is null)
        {
            return ApiError("Session không tồn tại hoặc đã kết thúc", 400);
        }

        var activeOrderCount = await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM orders WHERE session_id = @session_id AND status = 'active'",
            new { session_id = id },
            transaction);

        await connection.ExecuteAsync(@"
            UPDATE sessions
            SET end_time = @end_time,
                total_minutes = 0,
                total_amount = 0,
                status = 'cancelled'
            WHERE id = @id",
            new
            {
                end_time = DateTime.Now,
                id
            },
            transaction);

        await connection.ExecuteAsync(
            "UPDATE orders SET status = 'cancelled' WHERE session_id = @session_id AND status = 'active'",
            new { session_id = id },
            transaction);

        var activeOrderIds = (await connection.QueryAsync<int>(
            "SELECT id FROM orders WHERE session_id = @session_id",
            new { session_id = id },
            transaction)).ToList();

        foreach (var orderId in activeOrderIds)
        {
            await _inventoryService.RestockOrderAsync(
                connection,
                transaction,
                orderId,
                current_user.id,
                "session-cancel",
                id,
                "Hoàn kho do hủy phiên chơi");
        }

        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'available' WHERE id = @id",
            new { id = session.table_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.TableUpdatedAsync(session.table_id);
        await _realtimeNotifier.OrderUpdatedAsync(session.id);

        return Ok(new
        {
            message = activeOrderCount > 0
                ? "Đã hủy phiên chơi và hủy luôn đơn hàng chưa thanh toán"
                : "Đã hủy phiên chơi và trả bàn về trạng thái trống"
        });
    }

    [HttpPost("transfer-table")]
    public async Task<IActionResult> TransferTable([FromBody] transfer_table_request request)
    {
        if (request.session_id is null || request.to_table_id is null)
        {
            return ApiError("Thiếu thông tin chuyển bàn", 400);
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
            return ApiError("Session không tồn tại hoặc đã kết thúc", 400);
        }

        var target = await connection.QueryFirstOrDefaultAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id AND status = 'available' AND active = 1",
            new { id = request.to_table_id },
            transaction);

        if (target is null)
        {
            return ApiError("Bàn đích không khả dụng", 400);
        }

        var now = DateTime.Now;
        await connection.ExecuteAsync(
            "INSERT INTO table_transfers (session_id, from_table_id, to_table_id, transferred_at, transferred_by) VALUES (@session_id, @from_table_id, @to_table_id, @transferred_at, @transferred_by)",
            new
            {
                session_id = request.session_id,
                from_table_id = session.table_id,
                to_table_id = request.to_table_id,
                transferred_at = now,
                transferred_by = current_user.id
            },
            transaction);

        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'available' WHERE id = @id",
            new { id = session.table_id },
            transaction);

        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'playing' WHERE id = @id",
            new { id = request.to_table_id },
            transaction);

        await connection.ExecuteAsync(
            "UPDATE sessions SET table_id = @table_id WHERE id = @id",
            new { table_id = request.to_table_id, id = request.session_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.TablesUpdatedAsync([session.table_id, request.to_table_id.Value]);
        return Ok(new { message = "Chuyển bàn thành công", from = session.table_id, to = request.to_table_id });
    }

    [HttpPost("merge-tables")]
    public async Task<IActionResult> MergeTables([FromBody] merge_tables_request request)
    {
        if (request.primary_session_id is null || request.merge_session_ids is null || request.merge_session_ids.Count == 0)
        {
            return ApiError("Cần chọn session chính và session để gộp", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();
        var now = DateTime.Now;
        var mergedTableIds = new List<int>();

        foreach (var mergeSessionId in request.merge_session_ids)
        {
            await connection.ExecuteAsync(
                "INSERT INTO session_merges (primary_session_id, merged_session_id, merged_at, merged_by) VALUES (@primary_session_id, @merged_session_id, @merged_at, @merged_by)",
                new
                {
                    primary_session_id = request.primary_session_id,
                    merged_session_id = mergeSessionId,
                    merged_at = now,
                    merged_by = current_user.id
                },
                transaction);

            var mergedSession = await connection.QueryFirstOrDefaultAsync<session_record>(@"
                SELECT s.*, t.price_per_hour
                FROM sessions s
                JOIN `tables` t ON s.table_id = t.id
                WHERE s.id = @id AND s.status = 'active'",
                new { id = mergeSessionId },
                transaction);

            if (mergedSession is null)
            {
                continue;
            }

            await connection.ExecuteAsync(
                "UPDATE orders SET session_id = @primary_session_id WHERE session_id = @merged_session_id",
                new
                {
                    primary_session_id = request.primary_session_id,
                    merged_session_id = mergeSessionId
                },
                transaction);

            var totalMinutes = (int)Math.Ceiling((now - mergedSession.start_time).TotalMinutes);
            var totalAmount = (await _pricingService.CalculateAsync(
                connection,
                transaction,
                mergedSession.start_time,
                now,
                mergedSession.table_type,
                mergedSession.price_per_hour ?? 0,
                mergedSession.combo_hours,
                mergedSession.combo_price)).total_amount;

            await connection.ExecuteAsync(
                "UPDATE sessions SET end_time = @end_time, total_minutes = @total_minutes, total_amount = @total_amount, status = 'completed' WHERE id = @id",
                new
                {
                    end_time = now,
                    total_minutes = totalMinutes,
                    total_amount = totalAmount,
                    id = mergeSessionId
                },
                transaction);

            await connection.ExecuteAsync(
                "UPDATE `tables` SET status = 'available' WHERE id = @id",
                new { id = mergedSession.table_id },
                transaction);

            mergedTableIds.Add(mergedSession.table_id);
        }

        transaction.Commit();
        if (mergedTableIds.Count > 0)
        {
            await _realtimeNotifier.TablesUpdatedAsync(mergedTableIds);
        }
        await _realtimeNotifier.OrderUpdatedAsync(request.primary_session_id.Value);
        return Ok(new { message = "Gộp bàn thành công" });
    }
}
