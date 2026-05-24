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
public sealed class ChatbotController : AppApiController
{
    private static readonly string[] SupportedTimeFormats =
    [
        "H:mm",
        "HH:mm"
    ];

    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;

    public ChatbotController(MySqlConnectionFactory connectionFactory, IRealtimeNotifier realtimeNotifier)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
    }

    [HttpGet("check-availability")]
    public async Task<IActionResult> CheckAvailability([FromQuery] string? time)
    {
        if (!TryResolveReservationDateTime(time, out var reservationTime, out var normalizedTime))
        {
            return ApiError("time không hợp lệ. Ví dụ: 19:00", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var availableTables = await connection.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*)
            FROM `tables` t
            WHERE t.active = 1
              AND t.status = 'available'
              AND NOT EXISTS (
                  SELECT 1
                  FROM reservations r
                  WHERE r.table_id = t.id
                    AND r.status = 'pending'
                    AND DATE(r.reserved_time) = DATE(@reservation_time)
                    AND TIME_FORMAT(r.reserved_time, '%H:%i') = TIME_FORMAT(@reservation_time, '%H:%i')
              )",
            new { reservation_time = reservationTime });

        return Ok(new
        {
            available = availableTables > 0,
            tables = availableTables,
            time = normalizedTime,
            date = reservationTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
        });
    }

    [HttpPost("book-table")]
    public async Task<IActionResult> BookTable([FromBody] chatbot_book_table_request request)
    {
        if (!TryResolveReservationDateTime(request.time, out var reservationTime, out var normalizedTime))
        {
            return ApiError("time không hợp lệ. Ví dụ: 19:00 hoặc mai 19:00", 400);
        }

        if (request.people is null || request.people <= 0)
        {
            return ApiError("people phải lớn hơn 0", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var preferredType = ResolvePreferredType(request);
        var budgetPerHour = request.budget_per_hour;
        var requestedTableName = request.table_name?.Trim();

        // CẢI THIỆN: Nếu đặt cho tương lai (ví dụ ngày mai), không cần quan tâm status hiện tại của bàn là gì (available hay playing)
        var isFuture = reservationTime > DateTime.Now.AddMinutes(30);

        var table = await connection.QueryFirstOrDefaultAsync<table_record>(@"
            SELECT t.*
            FROM `tables` t
            WHERE t.active = 1
              AND (@is_future = 1 OR t.status = 'available')
              AND (@requested_table_name IS NULL OR t.name LIKE @requested_table_pattern)
              AND NOT EXISTS (
                  SELECT 1
                  FROM reservations r
                  WHERE r.table_id = t.id
                    AND r.status = 'pending'
                    AND DATE(r.reserved_time) = DATE(@reservation_time)
                    AND TIME_FORMAT(r.reserved_time, '%H:%i') = TIME_FORMAT(@reservation_time, '%H:%i')
              )
            ORDER BY
                CASE
                    WHEN @requested_table_name IS NOT NULL THEN 0 -- Nếu có tên bàn, ưu tiên hàng đầu
                    WHEN @preferred_type IS NOT NULL AND t.type = @preferred_type THEN 0
                    WHEN @preferred_type IS NOT NULL THEN 1
                    ELSE 0
                END,
                CASE
                    WHEN @budget_per_hour IS NOT NULL AND t.price_per_hour <= @budget_per_hour THEN 0
                    WHEN @budget_per_hour IS NOT NULL THEN 1
                    ELSE 0
                END,
                t.position_order,
                t.id
            LIMIT 1",
            new
            {
                reservation_time = reservationTime,
                preferred_type = preferredType,
                budget_per_hour = budgetPerHour,
                is_future = isFuture ? 1 : 0,
                requested_table_name = requestedTableName,
                requested_table_pattern = $"%{requestedTableName}%"
            },
            transaction);

        if (table is null)
        {
            if (!string.IsNullOrEmpty(requestedTableName))
            {
                return Ok(new
                {
                    success = false,
                    message = $"{requestedTableName} đã được đặt trước rồi hoặc không khả dụng lúc {normalizedTime} ngày {reservationTime:dd/MM}. Bạn chọn bàn khác nhé!"
                });
            }

            return Ok(new
            {
                success = false,
                message = $"Hiện không còn bàn trống lúc {normalizedTime} ngày {reservationTime:dd/MM}"
            });
        }

        var customerName = string.IsNullOrWhiteSpace(request.customer_name)
            ? $"Khách chatbot ({request.people} người)"
            : request.customer_name.Trim();
        var note = $"Đặt qua chatbot cho {request.people} người";

        await connection.ExecuteAsync(@"
            INSERT INTO reservations (table_id, customer_name, reserved_time, note, created_by)
            VALUES (@table_id, @customer_name, @reserved_time, @note, @created_by)",
            new
            {
                table_id = table.id,
                customer_name = customerName,
                reserved_time = reservationTime,
                note,
                created_by = current_user.id
            },
            transaction);

        // CẢI THIỆN: Chỉ đổi trạng thái bàn sang 'reserved' nếu là đặt ngay bây giờ (trong vòng 30p)
        if (!isFuture)
        {
            await connection.ExecuteAsync(
                "UPDATE `tables` SET status = 'reserved' WHERE id = @id",
                new { id = table.id },
                transaction);
        }

        transaction.Commit();
        await _realtimeNotifier.TableUpdatedAsync(table.id);

        return Ok(new
        {
            success = true,
            message = $"Đã đặt {table.name} lúc {normalizedTime} ngày {reservationTime:dd/MM}",
            table_id = table.id,
            table_name = table.name,
            table_type = table.type,
            price_per_hour = table.price_per_hour,
            reserved_time = reservationTime
        });
    }

    [HttpGet("chatbot/prices")]
    public async Task<IActionResult> GetPrices()
    {
        using var connection = _connectionFactory.CreateConnection();
        var prices = await connection.QueryAsync<chatbot_price_summary_record>(@"
            SELECT type, MIN(price_per_hour) AS min_price, MAX(price_per_hour) AS max_price, COUNT(*) AS total_tables
            FROM `tables`
            WHERE active = 1
            GROUP BY type
            ORDER BY type");

        return Ok(prices);
    }

    [HttpGet("chatbot/status")]
    public async Task<IActionResult> GetStatus()
    {
        using var connection = _connectionFactory.CreateConnection();
        var totalTables = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE active = 1");
        var available = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE status = 'available' AND active = 1");
        var playing = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE status = 'playing' AND active = 1");
        var reserved = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE status = 'reserved' AND active = 1");

        var activeSessions = await connection.QueryAsync(@"
            SELECT t.name AS table_name, t.type AS table_type, s.start_time,
                   TIMESTAMPDIFF(MINUTE, s.start_time, NOW()) AS minutes_played
            FROM sessions s
            JOIN `tables` t ON s.table_id = t.id
            WHERE s.status = 'active'
            ORDER BY s.start_time");

        return Ok(new
        {
            total = totalTables,
            available,
            playing,
            reserved,
            active_sessions = activeSessions
        });
    }

    [HttpGet("chatbot/revenue")]
    public async Task<IActionResult> GetRevenue()
    {
        using var connection = _connectionFactory.CreateConnection();
        var today = await connection.ExecuteScalarAsync<decimal>("SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE DATE(created_at) = CURDATE()");
        var month = await connection.ExecuteScalarAsync<decimal>("SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())");
        var sessionsToday = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM sessions WHERE DATE(created_at) = CURDATE()");
        var completedToday = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM sessions WHERE DATE(created_at) = CURDATE() AND status = 'completed'");

        return Ok(new
        {
            revenue_today = today,
            revenue_month = month,
            sessions_today = sessionsToday,
            completed_today = completedToday
        });
    }

    [HttpGet("chatbot/menu")]
    public async Task<IActionResult> GetMenu([FromQuery] string? q)
    {
        using var connection = _connectionFactory.CreateConnection();

        string sql;
        object parameters;

        if (!string.IsNullOrWhiteSpace(q))
        {
            sql = @"
                SELECT mi.name, mi.price, mi.unit, mc.name AS category
                FROM menu_items mi
                JOIN menu_categories mc ON mi.category_id = mc.id
                WHERE mi.active = 1 AND mc.active = 1
                  AND mi.name LIKE @keyword
                ORDER BY mc.sort_order, mi.name
                LIMIT 20";
            parameters = new { keyword = $"%{q.Trim()}%" };
        }
        else
        {
            sql = @"
                SELECT mi.name, mi.price, mi.unit, mc.name AS category
                FROM menu_items mi
                JOIN menu_categories mc ON mi.category_id = mc.id
                WHERE mi.active = 1 AND mc.active = 1
                ORDER BY mc.sort_order, mi.name
                LIMIT 30";
            parameters = new { };
        }

        var items = await connection.QueryAsync(sql, parameters);
        return Ok(items);
    }

    private static bool TryResolveReservationDateTime(string? rawTime, out DateTime reservationTime, out string normalizedTime)
    {
        reservationTime = default;
        normalizedTime = string.Empty;

        if (string.IsNullOrWhiteSpace(rawTime))
        {
            return false;
        }

        var raw = rawTime.Trim().ToLower();
        var isTomorrow = raw.Contains("mai") || raw.Contains("ngay mai");
        
        // Loại bỏ chữ "mai" để parse giờ
        var timeOnly = raw.Replace("mai", "").Replace("ngay", "").Trim();

        if (!DateTime.TryParseExact(
                timeOnly,
                SupportedTimeFormats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsedTime))
        {
            return false;
        }

        var now = DateTime.Now;
        reservationTime = now.Date
            .AddHours(parsedTime.Hour)
            .AddMinutes(parsedTime.Minute);

        // Nếu có chữ "mai" hoặc giờ đã trôi qua trong ngày hôm nay thì cộng thêm 1 ngày
        if (isTomorrow || reservationTime < now.AddMinutes(-5))
        {
            reservationTime = reservationTime.AddDays(1);
        }

        normalizedTime = reservationTime.ToString("HH:mm", CultureInfo.InvariantCulture);
        return true;
    }

    private static string? ResolvePreferredType(chatbot_book_table_request request)
    {
        if (string.Equals(request.preferred_type, "vip", StringComparison.OrdinalIgnoreCase))
        {
            return "vip";
        }

        if (string.Equals(request.preferred_type, "standard", StringComparison.OrdinalIgnoreCase))
        {
            return "standard";
        }

        if (request.budget_per_hour.HasValue)
        {
            // Nếu yêu cầu rẻ nhất (budget thấp), mặc định là standard
            if (request.budget_per_hour.Value < 50000) return "standard";
            return request.budget_per_hour.Value >= 100000 ? "vip" : "standard";
        }

        return request.people >= 4 ? "vip" : "standard";
    }
}
