using BidaCSharp.Data;
using BidaCSharp.Models;
using BidaCSharp.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Route("api")]
public sealed class AuthController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;
    private readonly JwtTokenService _jwtTokenService;

    public AuthController(MySqlConnectionFactory connectionFactory, JwtTokenService jwtTokenService)
    {
        _connectionFactory = connectionFactory;
        _jwtTokenService = jwtTokenService;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] login_request request)
    {
        if (string.IsNullOrWhiteSpace(request.username) || string.IsNullOrWhiteSpace(request.password))
        {
            return ApiError("Username và password là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var user = await connection.QueryFirstOrDefaultAsync<user_record>(
            "SELECT * FROM users WHERE username = @username AND active = 1 LIMIT 1",
            new { username = request.username.Trim() });

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.password, user.password))
        {
            return ApiError("Tên đăng nhập hoặc mật khẩu không đúng", 401);
        }

        return Ok(new login_response
        {
            token = _jwtTokenService.CreateToken(user),
            user = new { user.id, user.username, user.full_name, user.role }
        });
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        return Ok(new
        {
            current_user.id,
            current_user.username,
            current_user.full_name,
            current_user.role
        });
    }
}
