using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace BidaCSharp.Hubs;

[Authorize]
public sealed class OperationsHub : Hub
{
}
