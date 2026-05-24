using System.Globalization;
using BidaCSharp.Data;
using BidaCSharp.Models;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class DashboardController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;

    public DashboardController(MySqlConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        using var connection = _connectionFactory.CreateConnection();

        var totalTables = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE active = 1");
        var playingTables = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE status = 'playing' AND active = 1");
        var reservedTables = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE status = 'reserved' AND active = 1");
        var availableTables = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM `tables` WHERE status = 'available' AND active = 1");
        var revenueToday = await connection.ExecuteScalarAsync<decimal>("SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE DATE(created_at) = CURDATE()");
        var revenueMonth = await connection.ExecuteScalarAsync<decimal>("SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())");
        var topItems = await connection.QueryAsync<report_top_item>(@"
            SELECT mi.name AS item_name, SUM(oi.quantity) AS total_qty, SUM(oi.subtotal) AS total_revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN menu_items mi ON mi.id = oi.menu_item_id
            WHERE o.status = 'completed' AND mi.active = 1
            GROUP BY mi.id, mi.name
            ORDER BY total_qty DESC, total_revenue DESC
            LIMIT 5");
        var recentSessions = await connection.QueryAsync<session_record>(@"
            SELECT s.*, t.name AS table_name
            FROM sessions s
            JOIN `tables` t ON s.table_id = t.id
            ORDER BY s.created_at DESC
            LIMIT 10");
        var statusBreakdown = await connection.QueryAsync<label_value_record>(@"
            SELECT
                CASE status
                    WHEN 'available' THEN 'Trống'
                    WHEN 'playing' THEN 'Đang chơi'
                    WHEN 'reserved' THEN 'Đặt trước'
                    ELSE status
                END AS label,
                COUNT(*) AS value
            FROM `tables`
            WHERE active = 1
            GROUP BY status");
        var tableTypeBreakdown = await connection.QueryAsync<label_value_record>(@"
            SELECT
                CASE type
                    WHEN 'vip' THEN 'Bàn VIP'
                    ELSE 'Bàn thường'
                END AS label,
                COUNT(*) AS value
            FROM `tables`
            WHERE active = 1
            GROUP BY type");
        var paymentMethodBreakdown = await connection.QueryAsync<label_value_record>(@"
            SELECT
                CASE payment_method
                    WHEN 'cash' THEN 'Tiền mặt'
                    WHEN 'transfer' THEN 'Chuyển khoản'
                    ELSE 'Thẻ'
                END AS label,
                COUNT(*) AS value
            FROM payments
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY payment_method");

        var revenueRows = (await connection.QueryAsync<daily_revenue_record>(@"
            SELECT DATE(created_at) AS revenue_date, COALESCE(SUM(total_amount), 0) AS total_amount
            FROM payments
            WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)"))
            .ToDictionary(item => DateOnly.FromDateTime(item.revenue_date), item => item.total_amount);

        var revenueByDay = Enumerable.Range(0, 7)
            .Select(offset =>
            {
                var date = DateOnly.FromDateTime(DateTime.Today.AddDays(offset - 6));
                return new
                {
                    label = date.ToString("dd/MM", CultureInfo.InvariantCulture),
                    value = revenueRows.TryGetValue(date, out var amount) ? amount : 0m
                };
            })
            .ToArray();

        return Ok(new
        {
            totalTables,
            playingTables,
            reservedTables,
            availableTables,
            revenueToday,
            revenueMonth,
            topItems,
            recentSessions,
            revenueByDay,
            statusBreakdown,
            tableTypeBreakdown,
            paymentMethodBreakdown
        });
    }

    [HttpGet("reports/table-efficiency")]
    public async Task<IActionResult> GetTableEfficiency([FromQuery] string? from, [FromQuery] string? to)
    {
        using var connection = _connectionFactory.CreateConnection();

        var fromDate = DateTime.TryParse(from, out var parsedFrom)
            ? parsedFrom.Date
            : DateTime.Today.AddDays(-6);
        var toDate = DateTime.TryParse(to, out var parsedTo)
            ? parsedTo.Date
            : DateTime.Today;

        if (toDate < fromDate)
        {
            (fromDate, toDate) = (toDate, fromDate);
        }

        var operatingHoursRaw = await connection.ExecuteScalarAsync<string?>(
            "SELECT setting_value FROM settings WHERE setting_key = 'operating_hours_per_day' LIMIT 1");
        var operatingHours = decimal.TryParse(operatingHoursRaw, out var parsedHours) && parsedHours > 0
            ? parsedHours
            : 12m;

        var rows = (await connection.QueryAsync<table_efficiency_record>(@"
            SELECT
                t.id AS table_id,
                t.name AS table_name,
                t.type AS table_type,
                COUNT(s.id) AS sessions_count,
                COALESCE(SUM(s.total_minutes), 0) AS total_minutes,
                COALESCE(SUM(s.total_amount), 0) AS play_revenue,
                COALESCE(AVG(NULLIF(s.total_minutes, 0)), 0) AS avg_minutes
            FROM `tables` t
            LEFT JOIN sessions s
                ON s.table_id = t.id
                AND s.status = 'completed'
                AND s.end_time IS NOT NULL
                AND DATE(s.end_time) BETWEEN @from_date AND @to_date
            WHERE t.active = 1
            GROUP BY t.id, t.name, t.type
            ORDER BY play_revenue DESC, total_minutes DESC, t.name ASC",
            new
            {
                from_date = fromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                to_date = toDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            })).ToList();

        var totalDays = Math.Max(1, (toDate - fromDate).Days + 1);
        var availableMinutesPerTable = operatingHours * 60m * totalDays;
        var data = rows.Select(row => new
        {
            row.table_id,
            row.table_name,
            row.table_type,
            row.sessions_count,
            total_minutes = row.total_minutes,
            total_hours = Math.Round(row.total_minutes / 60m, 1, MidpointRounding.AwayFromZero),
            play_revenue = row.play_revenue,
            avg_minutes = Math.Round(row.avg_minutes, 0, MidpointRounding.AwayFromZero),
            utilization_rate = availableMinutesPerTable <= 0
                ? 0
                : Math.Round(row.total_minutes / availableMinutesPerTable * 100m, 1, MidpointRounding.AwayFromZero)
        }).ToArray();

        return Ok(new
        {
            operating_hours_per_day = operatingHours,
            total_days = totalDays,
            summary = new
            {
                total_play_hours = Math.Round(data.Sum(item => (decimal)item.total_hours), 1, MidpointRounding.AwayFromZero),
                total_play_revenue = data.Sum(item => item.play_revenue),
                avg_utilization_rate = data.Length == 0 ? 0 : Math.Round(data.Average(item => item.utilization_rate), 1, MidpointRounding.AwayFromZero),
                top_table = data.OrderByDescending(item => item.play_revenue).FirstOrDefault()
            },
            items = data
        });
    }
}
