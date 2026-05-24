using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BidaCSharp.Models;
using Microsoft.IdentityModel.Tokens;

namespace BidaCSharp.Services;

public sealed class JwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string CreateToken(user_record user)
    {
        var secret = _configuration["Jwt:Secret"] ?? "billiard_club_secret_key_2024_for_aspnetcore_32bytes";
        var expiresIn = _configuration["Jwt:ExpiresIn"] ?? "24h";
        var claims = new[]
        {
            new Claim("id", user.id.ToString()),
            new Claim("username", user.username),
            new Claim("full_name", user.full_name),
            new Claim("role", user.role)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.Add(ParseExpiry(expiresIn)),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static TimeSpan ParseExpiry(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return TimeSpan.FromHours(24);
        value = value.Trim().ToLowerInvariant();
        if (value.EndsWith("h") && double.TryParse(value[..^1], out var hours)) return TimeSpan.FromHours(hours);
        if (value.EndsWith("d") && double.TryParse(value[..^1], out var days)) return TimeSpan.FromDays(days);
        if (value.EndsWith("m") && double.TryParse(value[..^1], out var minutes)) return TimeSpan.FromMinutes(minutes);
        return TimeSpan.FromHours(24);
    }
}
