using BidaCSharp.Data;
using BidaCSharp.Models;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.RegularExpressions;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api/customers")]
public sealed class CustomersController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;

    public CustomersController(MySqlConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetCustomers([FromQuery] string? search)
    {
        using var connection = _connectionFactory.CreateConnection();
        var sql = """
            SELECT *
            FROM customers
            WHERE active = 1
            """;
        var parameters = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var keyword = $"%{search.Trim()}%";
            var normalizedPhone = NormalizePhone(search);
            sql += """
                 AND (
                    phone LIKE @keyword
                    OR COALESCE(full_name, '') LIKE @keyword
                    OR COALESCE(rank_name, '') LIKE @keyword
                    OR (@normalized_phone IS NOT NULL AND phone LIKE CONCAT('%', @normalized_phone, '%'))
                 )
                """;
            parameters.Add("keyword", keyword);
            parameters.Add("normalized_phone", normalizedPhone);
        }

        sql += " ORDER BY points DESC, total_spent DESC, updated_at DESC LIMIT 300";
        var customers = await connection.QueryAsync<customer_record>(sql, parameters);
        return Ok(customers);
    }

    [HttpGet("lookup")]
    public async Task<IActionResult> LookupCustomer([FromQuery] string? phone)
    {
        var normalizedPhone = NormalizePhone(phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return Ok(null);
        }

        using var connection = _connectionFactory.CreateConnection();
        var customer = await connection.QueryFirstOrDefaultAsync<customer_record>(
            "SELECT * FROM customers WHERE phone = @phone AND active = 1 LIMIT 1",
            new { phone = normalizedPhone });

        return Ok(customer);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetCustomer(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var customer = await connection.QueryFirstOrDefaultAsync<customer_record>(
            "SELECT * FROM customers WHERE id = @id AND active = 1",
            new { id });

        if (customer is null)
        {
            return ApiError("Không tìm thấy khách hàng", 404);
        }

        return Ok(customer);
    }

    [HttpGet("{id:int}/payments")]
    public async Task<IActionResult> GetCustomerPayments(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var payments = await connection.QueryAsync<payment_record>(@"
            SELECT
                p.*,
                (
                    SELECT GROUP_CONCAT(CONCAT(oi.item_name, ' x', oi.quantity) ORDER BY oi.item_name SEPARATOR ', ')
                    FROM orders o
                    JOIN order_items oi ON oi.order_id = o.id
                    WHERE o.session_id = p.session_id
                ) AS order_items_summary
            FROM payments p
            WHERE p.customer_id = @id
            ORDER BY p.created_at DESC
            LIMIT 100",
            new { id });

        return Ok(payments);
    }

    [HttpGet("{id:int}/points-history")]
    public async Task<IActionResult> GetPointsHistory(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var history = await connection.QueryAsync<membership_points_history_record>(@"
            SELECT *
            FROM membership_points_history
            WHERE customer_id = @id
            ORDER BY created_at DESC
            LIMIT 100",
            new { id });

        return Ok(history);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateCustomer(int id, [FromBody] customer_request request)
    {
        using var connection = _connectionFactory.CreateConnection();
        var existing = await connection.QueryFirstOrDefaultAsync<customer_record>(
            "SELECT * FROM customers WHERE id = @id AND active = 1",
            new { id });

        if (existing is null)
        {
            return ApiError("Không tìm thấy khách hàng", 404);
        }

        var normalizedPhone = NormalizePhone(request.phone) ?? existing.phone;
        if (normalizedPhone != existing.phone)
        {
            var duplicate = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM customers WHERE phone = @phone AND id <> @id AND active = 1",
                new { phone = normalizedPhone, id });
            if (duplicate > 0)
            {
                return ApiError("Số điện thoại đã tồn tại", 400);
            }
        }

        await connection.ExecuteAsync(@"
            UPDATE customers
            SET phone = @phone,
                full_name = @full_name,
                rank_name = @rank_name,
                points = @points,
                note = @note,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = @id",
            new
            {
                id,
                phone = normalizedPhone,
                full_name = string.IsNullOrWhiteSpace(request.full_name) ? null : request.full_name.Trim(),
                rank_name = string.IsNullOrWhiteSpace(request.rank_name) ? existing.rank_name : request.rank_name.Trim(),
                points = request.points ?? existing.points,
                note = string.IsNullOrWhiteSpace(request.note) ? null : request.note.Trim()
            });

        var customer = await connection.QueryFirstAsync<customer_record>(
            "SELECT * FROM customers WHERE id = @id",
            new { id });
        return Ok(customer);
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
}
