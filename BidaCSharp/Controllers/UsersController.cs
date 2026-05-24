using BidaCSharp.Data;
using BidaCSharp.Models;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize(Roles = "admin")]
[Route("api/staff-users")]
public sealed class UsersController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;

    public UsersController(MySqlConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetStaffUsers()
    {
        using var connection = _connectionFactory.CreateConnection();
        var users = await connection.QueryAsync<user_record>(
            "SELECT id, username, password, full_name, role, active FROM users WHERE role = 'staff' ORDER BY active DESC, full_name ASC, username ASC");
        return Ok(users.Select(user => new
        {
            user.id,
            user.username,
            user.full_name,
            user.role,
            user.active
        }));
    }

    [HttpPost]
    public async Task<IActionResult> CreateStaffUser([FromBody] staff_user_request request)
    {
        if (string.IsNullOrWhiteSpace(request.username) || string.IsNullOrWhiteSpace(request.password) || string.IsNullOrWhiteSpace(request.full_name))
        {
            return ApiError("Tên đăng nhập, mật khẩu và họ tên là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var exists = await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM users WHERE username = @username",
            new { username = request.username.Trim() });
        if (exists > 0)
        {
            return ApiError("Tên đăng nhập đã tồn tại", 400);
        }

        var id = await connection.ExecuteScalarAsync<int>(@"
            INSERT INTO users (username, password, full_name, role, active)
            VALUES (@username, @password, @full_name, 'staff', @active);
            SELECT LAST_INSERT_ID();",
            new
            {
                username = request.username.Trim(),
                password = BCrypt.Net.BCrypt.HashPassword(request.password),
                full_name = request.full_name.Trim(),
                active = request.active ?? true
            });

        return Ok(new { id, message = "Đã tạo tài khoản nhân viên" });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateStaffUser(int id, [FromBody] staff_user_request request)
    {
        using var connection = _connectionFactory.CreateConnection();
        var user = await connection.QueryFirstOrDefaultAsync<user_record>(
            "SELECT * FROM users WHERE id = @id AND role = 'staff'",
            new { id });
        if (user is null)
        {
            return ApiError("Không tìm thấy tài khoản nhân viên", 404);
        }

        var username = string.IsNullOrWhiteSpace(request.username) ? user.username : request.username.Trim();
        var fullName = string.IsNullOrWhiteSpace(request.full_name) ? user.full_name : request.full_name.Trim();
        var duplicate = await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM users WHERE username = @username AND id <> @id",
            new { username, id });
        if (duplicate > 0)
        {
            return ApiError("Tên đăng nhập đã tồn tại", 400);
        }

        await connection.ExecuteAsync(@"
            UPDATE users
            SET username = @username,
                full_name = @full_name,
                password = @password,
                active = @active
            WHERE id = @id",
            new
            {
                id,
                username,
                full_name = fullName,
                password = string.IsNullOrWhiteSpace(request.password) ? user.password : BCrypt.Net.BCrypt.HashPassword(request.password),
                active = request.active ?? user.active
            });

        return Ok(new { message = "Đã cập nhật tài khoản nhân viên" });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteStaffUser(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var affected = await connection.ExecuteAsync(
            "UPDATE users SET active = 0 WHERE id = @id AND role = 'staff'",
            new { id });
        if (affected == 0)
        {
            return ApiError("Không tìm thấy tài khoản nhân viên", 404);
        }

        return Ok(new { message = "Đã vô hiệu hóa tài khoản nhân viên" });
    }
}
