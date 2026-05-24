using System.Text.Json;
using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class PaymentsController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly PricingService _pricingService;

    public PaymentsController(
        MySqlConnectionFactory connectionFactory,
        IRealtimeNotifier realtimeNotifier,
        PricingService pricingService)
    {
        _connectionFactory = connectionFactory;
        _realtimeNotifier = realtimeNotifier;
        _pricingService = pricingService;
    }

    private sealed class MembershipRankRule
    {
        public string name { get; set; } = string.Empty;
        public decimal min_spent { get; set; }
        public int min_hours { get; set; }
        public string? benefit { get; set; }
    }

    [HttpGet("surcharges")]
    public async Task<IActionResult> GetSurcharges()
    {
        using var connection = _connectionFactory.CreateConnection();
        var surcharges = await connection.QueryAsync<surcharge_record>(
            "SELECT * FROM surcharges WHERE active = 1");
        return Ok(surcharges);
    }

    [HttpPost("payment")]
    public async Task<IActionResult> CreatePayment([FromBody] payment_request request)
    {
        if (request.session_id is null)
        {
            return ApiError("session_id là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var session = await connection.QueryFirstOrDefaultAsync<session_record>(@"
            SELECT s.*, t.name AS table_name, t.price_per_hour, t.type AS table_type
            FROM sessions s
            JOIN `tables` t ON s.table_id = t.id
            WHERE s.id = @id AND s.status = 'active'",
            new { id = request.session_id },
            transaction);

        if (session is null)
        {
            return ApiError("Session không tồn tại hoặc đã kết thúc", 400);
        }

        var now = DateTime.Now;
        var totalMinutes = (int)Math.Ceiling((now - session.start_time).TotalMinutes);
        var pricingBreakdown = await _pricingService.CalculateAsync(
            connection,
            transaction,
            session.start_time,
            now,
            session.table_type,
            session.price_per_hour ?? 0,
            session.combo_hours,
            session.combo_price);
        var playAmount = pricingBreakdown.total_amount;

        var mergedData = await connection.QueryFirstAsync<(int total_minutes, decimal total_amount)>(@"
            SELECT COALESCE(SUM(s.total_minutes), 0) AS total_minutes, COALESCE(SUM(s.total_amount), 0) AS total_amount
            FROM session_merges sm
            JOIN sessions s ON sm.merged_session_id = s.id
            WHERE sm.primary_session_id = @session_id",
            new { session_id = request.session_id },
            transaction);

        var finalPlayMinutes = totalMinutes + mergedData.total_minutes;
        var finalPlayAmount = playAmount + mergedData.total_amount;

        await connection.ExecuteAsync(
            "UPDATE sessions SET end_time = @end_time, total_minutes = @total_minutes, total_amount = @total_amount, status = 'completed' WHERE id = @id",
            new
            {
                end_time = now,
                total_minutes = finalPlayMinutes,
                total_amount = finalPlayAmount,
                id = request.session_id
            },
            transaction);

        var orderAmount = await connection.ExecuteScalarAsync<decimal>(
            "SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE session_id = @session_id AND status = 'active'",
            new { session_id = request.session_id },
            transaction);
        await connection.ExecuteAsync(
            "UPDATE orders SET status = 'completed' WHERE session_id = @session_id AND status = 'active'",
            new { session_id = request.session_id },
            transaction);

        decimal surchargeAmount = 0;
        if (request.surcharge_ids is { Count: > 0 })
        {
            var surcharges = (await connection.QueryAsync<surcharge_record>(
                "SELECT * FROM surcharges WHERE id IN @ids AND active = 1",
                new { ids = request.surcharge_ids },
                transaction)).ToList();

            foreach (var surcharge in surcharges)
            {
                var amount = surcharge.type == "fixed"
                    ? surcharge.value
                    : Math.Round((finalPlayAmount + orderAmount) * surcharge.value / 100m, 0, MidpointRounding.AwayFromZero);
                surchargeAmount += amount;
                await connection.ExecuteAsync(
                    "INSERT INTO session_surcharges (session_id, surcharge_id, name, type, value, amount) VALUES (@session_id, @surcharge_id, @name, @type, @value, @amount)",
                    new
                    {
                        session_id = request.session_id,
                        surcharge_id = surcharge.id,
                        surcharge.name,
                        surcharge.type,
                        surcharge.value,
                        amount
                    },
                    transaction);
            }
        }

        var discountPercent = request.discount_percent ?? 0;
        var subtotal = finalPlayAmount + orderAmount + surchargeAmount;
        var discountAmount = Math.Round(subtotal * discountPercent / 100m, 0, MidpointRounding.AwayFromZero);
        var totalAmount = subtotal - discountAmount;
        var normalizedPhone = NormalizePhone(request.customer_phone);
        var settings = await GetSettingsDictionary(connection, transaction);
        var membershipRules = ParseMembershipRankRules(settings);

        customer_record? customer = null;
        var pointsEarned = 0;
        if (!string.IsNullOrWhiteSpace(normalizedPhone))
        {
            customer = await connection.QueryFirstOrDefaultAsync<customer_record>(
                "SELECT * FROM customers WHERE phone = @phone AND active = 1 LIMIT 1",
                new { phone = normalizedPhone },
                transaction);

            if (customer is null)
            {
                var customerId = await connection.ExecuteScalarAsync<int>(@"
                    INSERT INTO customers (phone, rank_name, points, total_spent, total_play_minutes, total_visits, last_played_at, note)
                    VALUES (@phone, 'Bronze', 0, 0, 0, 0, @last_played_at, NULL);
                    SELECT LAST_INSERT_ID();",
                    new
                    {
                        phone = normalizedPhone,
                        last_played_at = now
                    },
                    transaction);

                customer = await connection.QueryFirstAsync<customer_record>(
                    "SELECT * FROM customers WHERE id = @id",
                    new { id = customerId },
                    transaction);
            }

            pointsEarned = CalculateMembershipPoints(totalAmount);
            var updatedPoints = customer.points + pointsEarned;
            var updatedVisits = customer.total_visits + 1;
            var updatedSpent = customer.total_spent + totalAmount;
            var updatedPlayMinutes = customer.total_play_minutes + finalPlayMinutes;
            var updatedRank = ResolveMembershipRank(updatedSpent, updatedPlayMinutes, membershipRules);

            await connection.ExecuteAsync(@"
                UPDATE customers
                SET points = @points,
                    total_spent = @total_spent,
                    total_play_minutes = @total_play_minutes,
                    total_visits = @total_visits,
                    last_played_at = @last_played_at,
                    rank_name = @rank_name,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = @id",
                new
                {
                    id = customer.id,
                    points = updatedPoints,
                    total_spent = updatedSpent,
                    total_play_minutes = updatedPlayMinutes,
                    total_visits = updatedVisits,
                    last_played_at = now,
                    rank_name = updatedRank
                },
                transaction);

            customer.points = updatedPoints;
            customer.total_spent = updatedSpent;
            customer.total_play_minutes = updatedPlayMinutes;
            customer.total_visits = updatedVisits;
            customer.last_played_at = now;
            customer.rank_name = updatedRank;
        }

        var paymentId = await connection.ExecuteScalarAsync<int>(@"
            INSERT INTO payments (session_id, table_name, start_time, end_time, play_duration, play_amount, order_amount, surcharge_amount, discount_percent, discount_amount, total_amount, payment_method, note, customer_id, customer_phone, customer_rank, membership_points_earned, created_by)
            VALUES (@session_id, @table_name, @start_time, @end_time, @play_duration, @play_amount, @order_amount, @surcharge_amount, @discount_percent, @discount_amount, @total_amount, @payment_method, @note, @customer_id, @customer_phone, @customer_rank, @membership_points_earned, @created_by);
            SELECT LAST_INSERT_ID();",
            new
            {
                session_id = request.session_id,
                table_name = session.table_name,
                start_time = session.start_time,
                end_time = now,
                play_duration = finalPlayMinutes,
                play_amount = finalPlayAmount,
                order_amount = orderAmount,
                surcharge_amount = surchargeAmount,
                discount_percent = discountPercent,
                discount_amount = discountAmount,
                total_amount = totalAmount,
                payment_method = string.IsNullOrWhiteSpace(request.payment_method) ? "cash" : request.payment_method,
                note = request.note,
                customer_id = customer?.id,
                customer_phone = normalizedPhone,
                customer_rank = customer?.rank_name,
                membership_points_earned = pointsEarned,
                created_by = current_user.id
            },
            transaction);

        if (customer is not null)
        {
            await connection.ExecuteAsync(@"
                INSERT INTO membership_points_history (customer_id, payment_id, points_delta, points_after, reason, note)
                VALUES (@customer_id, @payment_id, @points_delta, @points_after, @reason, @note)",
                new
                {
                    customer_id = customer.id,
                    payment_id = paymentId,
                    points_delta = pointsEarned,
                    points_after = customer.points,
                    reason = "payment",
                    note = $"Thanh toán bàn {session.table_name}"
                },
                transaction);
        }

        await connection.ExecuteAsync(
            "UPDATE `tables` SET status = 'available' WHERE id = @id",
            new { id = session.table_id },
            transaction);

        var appliedSurcharges = await connection.QueryAsync<session_surcharge_record>(
            "SELECT * FROM session_surcharges WHERE session_id = @session_id",
            new { session_id = request.session_id },
            transaction);
        var orderIds = (await connection.QueryAsync<int>(
            "SELECT id FROM orders WHERE session_id = @session_id",
            new { session_id = request.session_id },
            transaction)).ToList();
        var orderItems = orderIds.Count == 0
            ? Array.Empty<order_item_record>()
            : (await connection.QueryAsync<order_item_record>(
                "SELECT * FROM order_items WHERE order_id IN @order_ids",
                new { order_ids = orderIds },
                transaction)).ToArray();
        transaction.Commit();
        await _realtimeNotifier.TableUpdatedAsync(session.table_id);
        await _realtimeNotifier.PaymentCompletedAsync(request.session_id.Value, paymentId);

        return Ok(new
        {
            payment_id = paymentId,
            table_name = session.table_name,
            start_time = session.start_time,
            end_time = now,
            play_duration = finalPlayMinutes,
            play_amount = finalPlayAmount,
            combo_name = session.combo_name,
            combo_hours = session.combo_hours,
            combo_price = session.combo_price,
            combo_gift_type = session.combo_gift_type,
            combo_gift_name = session.combo_gift_name,
            pricing_segments = pricingBreakdown.segments,
            combo_minutes = pricingBreakdown.combo_minutes,
            combo_amount = pricingBreakdown.combo_amount,
            time_based_amount = pricingBreakdown.time_based_amount,
            order_amount = orderAmount,
            order_items = orderItems,
            surcharges = appliedSurcharges,
            surcharge_amount = surchargeAmount,
            discount_percent = discountPercent,
            discount_amount = discountAmount,
            total_amount = totalAmount,
            payment_method = string.IsNullOrWhiteSpace(request.payment_method) ? "cash" : request.payment_method,
            customer_phone = normalizedPhone,
            customer,
            membership_points_earned = pointsEarned,
            settings
        });
    }

    [HttpGet("payments")]
    public async Task<IActionResult> GetPayments([FromQuery] string? from, [FromQuery] string? to)
    {
        using var connection = _connectionFactory.CreateConnection();
        var sql = """
            SELECT
                p.*,
                t.type AS table_type,
                (
                    SELECT GROUP_CONCAT(CONCAT(oi.item_name, ' x', oi.quantity) ORDER BY oi.item_name SEPARATOR ', ')
                    FROM orders o
                    JOIN order_items oi ON oi.order_id = o.id
                    WHERE o.session_id = p.session_id
                ) AS order_items_summary
            FROM payments p
            LEFT JOIN sessions s ON s.id = p.session_id
            LEFT JOIN `tables` t ON t.id = s.table_id
            WHERE 1=1
            """;
        var parameters = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(from))
        {
            sql += " AND DATE(p.created_at) >= @from";
            parameters.Add("from", from);
        }

        if (!string.IsNullOrWhiteSpace(to))
        {
            sql += " AND DATE(p.created_at) <= @to";
            parameters.Add("to", to);
        }

        sql += " ORDER BY p.created_at DESC LIMIT 100";
        var payments = await connection.QueryAsync<payment_record>(sql, parameters);
        return Ok(payments);
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("payments/{id:int}")]
    public async Task<IActionResult> DeletePayment(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var payment = await connection.QueryFirstOrDefaultAsync<payment_record>(
            "SELECT * FROM payments WHERE id = @id",
            new { id },
            transaction);
        if (payment is null)
        {
            return ApiError("Không tìm thấy thanh toán", 404);
        }

        await connection.ExecuteAsync(
            "DELETE FROM session_surcharges WHERE session_id = @session_id",
            new { session_id = payment.session_id },
            transaction);
        await connection.ExecuteAsync(
            "DELETE FROM payments WHERE id = @id",
            new { id },
            transaction);

        transaction.Commit();
        return Ok(new { message = "Đã xóa thanh toán" });
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        using var connection = _connectionFactory.CreateConnection();
        var settings = await GetSettingsDictionary(connection, null);
        return Ok(settings);
    }

    [Authorize(Roles = "admin")]
    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] Dictionary<string, JsonElement> body)
    {
        using var connection = _connectionFactory.CreateConnection();
        foreach (var (key, value) in body)
        {
            var stringValue = value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Null => null,
                _ => value.GetRawText()
            };

            await connection.ExecuteAsync(
                "INSERT INTO settings (setting_key, setting_value) VALUES (@setting_key, @setting_value) ON DUPLICATE KEY UPDATE setting_value = @setting_value",
                new { setting_key = key, setting_value = stringValue });
        }

        return Ok(new { message = "Cập nhật thành công" });
    }

    private static async Task<Dictionary<string, string?>> GetSettingsDictionary(System.Data.IDbConnection connection, System.Data.IDbTransaction? transaction)
    {
        var settings = await connection.QueryAsync<setting_record>("SELECT * FROM settings", transaction: transaction);
        return settings.ToDictionary(item => item.setting_key, item => item.setting_value);
    }

    private static string? NormalizePhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = Regex.Replace(value, "[^0-9]", string.Empty);
        return digits.Length is >= 9 and <= 15 ? digits : null;
    }

    private static int CalculateMembershipPoints(decimal totalAmount)
    {
        return Math.Max(0, (int)Math.Floor(totalAmount / 10000m));
    }

    private static string ResolveMembershipRank(decimal totalSpent, int totalPlayMinutes, IReadOnlyList<MembershipRankRule> rules)
    {
        var totalHours = totalPlayMinutes / 60m;
        foreach (var rule in rules.OrderByDescending(item => item.min_spent).ThenByDescending(item => item.min_hours))
        {
            if (totalSpent >= rule.min_spent || totalHours >= rule.min_hours)
            {
                return string.IsNullOrWhiteSpace(rule.name) ? "Bronze" : rule.name;
            }
        }

        return "Bronze";
    }

    private static List<MembershipRankRule> ParseMembershipRankRules(Dictionary<string, string?> settings)
    {
        if (settings.TryGetValue("membership_rank_rules", out var rawValue) && !string.IsNullOrWhiteSpace(rawValue))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<MembershipRankRule>>(rawValue);
                if (parsed is { Count: > 0 })
                {
                    return parsed
                        .Where(item => !string.IsNullOrWhiteSpace(item.name))
                        .OrderBy(item => item.min_spent)
                        .ThenBy(item => item.min_hours)
                        .ToList();
                }
            }
            catch
            {
                // Fallback to defaults below.
            }
        }

        return new List<MembershipRankRule>
        {
            new() { name = "Bronze", min_spent = 0, min_hours = 0, benefit = "Tích điểm" },
            new() { name = "Silver", min_spent = 2000000m, min_hours = 20, benefit = "Giảm 5%" },
            new() { name = "Gold", min_spent = 5000000m, min_hours = 60, benefit = "Giảm 10%" },
            new() { name = "VIP", min_spent = 10000000m, min_hours = 150, benefit = "Giảm 15% + ưu tiên bàn VIP" }
        };
    }
}
