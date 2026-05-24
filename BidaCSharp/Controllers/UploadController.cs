using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize(Roles = "admin")]
[Route("api/upload")]
public sealed class UploadController : AppApiController
{
    private readonly IWebHostEnvironment _env;

    public UploadController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpPost("image")]
    public async Task<IActionResult> UploadImage([FromForm] IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return ApiError("Vui lòng chọn một file", 400);
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
        if (!allowedExtensions.Contains(ext))
        {
            return ApiError($"Định dạng không được hỗ trợ. Chỉ cho phép: {string.Join(", ", allowedExtensions)}", 400);
        }

        if (file.Length > 5 * 1024 * 1024)
        {
            return ApiError("Dung lượng file không được vượt quá 5MB", 400);
        }

        var webRoot = _env.WebRootPath;
        if (string.IsNullOrWhiteSpace(webRoot))
        {
            webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        }

        var uploadDir = Path.Combine(webRoot, "images", "uploads");
        if (!Directory.Exists(uploadDir))
        {
            Directory.CreateDirectory(uploadDir);
        }

        var fileName = $"{Guid.NewGuid():N}{ext}";
        var filePath = Path.Combine(uploadDir, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var url = $"/images/uploads/{fileName}";
        return Ok(new { url });
    }
}
