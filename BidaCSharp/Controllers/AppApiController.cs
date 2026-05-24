using BidaCSharp.Models;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[ApiController]
public abstract class AppApiController : ControllerBase
{
    protected CurrentUser current_user => CurrentUser.FromClaims(User);

    protected IActionResult ApiError(string message, int statusCode = 400)
    {
        return StatusCode(statusCode, new { error = message });
    }
}
