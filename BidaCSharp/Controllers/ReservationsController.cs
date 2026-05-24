using System.Globalization;
using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class ReservationsController : AppApiController
{
    private static readonly string[] ReservationDateTimeFormats =
    [
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd HH:mm:ss"
    ];

    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;

    public ReservationsController(MySqlConnectionFactory connectionFactory, IRealtimeNotifier realtimeNotifier)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
    }

    [HttpPost("reservations")]
    public async Task<IActionResult> CreateReservation([FromBody] reservation_request request)
    {
        if (request.table_id is null
            || string.IsNullOrWhiteSpace(request.customer_name)
            || string.IsNullOrWhiteSpace(request.reserved_time))
        {
            return ApiError("Thiếu thông tin đặt bàn", 400);
        }

        if (!TryParseReservationTime(request.reserved_time, out var reservedTime))
        {
            return ApiError("Thời gian đặt bàn không hợp lệ", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var table = await connection.QueryFirstOrDefaultAsync<table_record>(
            "SELECT * FROM `tables` WHERE id = @id",
            new { id = request.table_id },
            transaction);

        if (table is null)
        {
            return ApiError("Bàn không tồn tại", 404);
        }

        if (!string.Equals(table.status, "available", StringComparison.OrdinalIgnoreCase))
        {
            return ApiError("Bàn này đang không trống để đặt trước", 400);
        }

        await connection.ExecuteAsync(@"
            INSERT INTO reservations (table_id, customer_name, customer_phone, reserved_time, note, created_by)
            VALUES (@table_id, @customer_name, @customer_phone, @reserved_time, @note, @created_by)",
            new
            {
                table_id = request.table_id,
                customer_name = request.customer_name.Trim(),
                customer_phone = string.IsNullOrWhiteSpace(request.customer_phone) ? null : request.customer_phone.Trim(),
                reserved_time = reservedTime,
                note = request.note,
                created_by = current_user.id
            },
            transaction);

        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'reserved' WHERE id = @id",
            new { id = request.table_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.TableUpdatedAsync(request.table_id);
        return StatusCode(201, new { message = "Đặt bàn thành công" });
    }

    [HttpGet("reservations/table/{id:int}")]
    public async Task<IActionResult> GetTableReservation(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var reservation = await connection.QueryFirstOrDefaultAsync<reservation_record>(@"
            SELECT *
            FROM reservations
            WHERE table_id = @id AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1",
            new { id });

        if (reservation is null)
        {
            return ApiError("Không tìm thấy thông tin đặt bàn", 404);
        }

        return Ok(reservation);
    }

    [HttpPost("reservations/{id:int}/cancel")]
    public async Task<IActionResult> CancelReservation(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var reservation = await connection.QueryFirstOrDefaultAsync<reservation_record>(
            "SELECT * FROM reservations WHERE id = @id",
            new { id },
            transaction);

        if (reservation is null)
        {
            return ApiError("Không tìm thấy", 404);
        }

        if (!string.Equals(reservation.status, "pending", StringComparison.OrdinalIgnoreCase))
        {
            return ApiError("Không thể hủy", 400);
        }

        await connection.ExecuteAsync(
            "UPDATE reservations SET status = 'cancelled' WHERE id = @id",
            new { id },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'available' WHERE id = @id",
            new { id = reservation.table_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.TableUpdatedAsync(reservation.table_id);
        return Ok(new { message = "Đã hủy đặt bàn" });
    }

    [HttpPost("reservations/{id:int}/start")]
    public async Task<IActionResult> StartReservation(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var reservation = await connection.QueryFirstOrDefaultAsync<reservation_record>(
            "SELECT * FROM reservations WHERE id = @id",
            new { id },
            transaction);

        if (reservation is null)
        {
            return ApiError("Không tìm thấy", 404);
        }

        if (!string.Equals(reservation.status, "pending", StringComparison.OrdinalIgnoreCase))
        {
            return ApiError("Phiên đặt bàn này không còn hiệu lực", 400);
        }

        await connection.ExecuteAsync(
            "UPDATE reservations SET status = 'completed' WHERE id = @id",
            new { id },
            transaction);
        await connection.ExecuteAsync(
            "INSERT INTO sessions (table_id, start_time, created_by) VALUES (@table_id, @start_time, @created_by)",
            new
            {
                table_id = reservation.table_id,
                start_time = DateTime.Now,
                created_by = current_user.id
            },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'playing' WHERE id = @id",
            new { id = reservation.table_id },
            transaction);

        transaction.Commit();
        await _realtimeNotifier.TableUpdatedAsync(reservation.table_id);
        return Ok(new { message = "Mở bàn thành công từ trạng thái đặt trước" });
    }

    private static bool TryParseReservationTime(string rawValue, out DateTime reservedTime)
    {
        return DateTime.TryParseExact(
                   rawValue.Trim(),
                   ReservationDateTimeFormats,
                   CultureInfo.InvariantCulture,
                   DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal,
                   out reservedTime)
               || DateTime.TryParse(
                   rawValue,
                   CultureInfo.InvariantCulture,
                   DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal,
                   out reservedTime);
    }
}
