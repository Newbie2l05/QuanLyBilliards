using BidaCSharp.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace BidaCSharp.Services;

public interface IRealtimeNotifier
{
    Task TableUpdatedAsync(int? tableId = null, CancellationToken cancellationToken = default);
    Task TablesUpdatedAsync(IEnumerable<int> tableIds, CancellationToken cancellationToken = default);
    Task OrderUpdatedAsync(int sessionId, int? orderId = null, CancellationToken cancellationToken = default);
    Task PaymentCompletedAsync(int sessionId, int paymentId, CancellationToken cancellationToken = default);
}

public sealed class SignalRRealtimeNotifier : IRealtimeNotifier
{
    private readonly IHubContext<OperationsHub> _hubContext;

    public SignalRRealtimeNotifier(IHubContext<OperationsHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task TableUpdatedAsync(int? tableId = null, CancellationToken cancellationToken = default)
    {
        return _hubContext.Clients.All.SendAsync(
            "table-updated",
            new
            {
                table_id = tableId,
                updated_at = DateTime.UtcNow
            },
            cancellationToken);
    }

    public Task TablesUpdatedAsync(IEnumerable<int> tableIds, CancellationToken cancellationToken = default)
    {
        var normalizedIds = tableIds
            .Distinct()
            .OrderBy(id => id)
            .ToArray();

        return _hubContext.Clients.All.SendAsync(
            "table-updated",
            new
            {
                table_ids = normalizedIds,
                updated_at = DateTime.UtcNow
            },
            cancellationToken);
    }

    public Task OrderUpdatedAsync(int sessionId, int? orderId = null, CancellationToken cancellationToken = default)
    {
        return _hubContext.Clients.All.SendAsync(
            "order-updated",
            new
            {
                session_id = sessionId,
                order_id = orderId,
                updated_at = DateTime.UtcNow
            },
            cancellationToken);
    }

    public Task PaymentCompletedAsync(int sessionId, int paymentId, CancellationToken cancellationToken = default)
    {
        return _hubContext.Clients.All.SendAsync(
            "payment-completed",
            new
            {
                session_id = sessionId,
                payment_id = paymentId,
                updated_at = DateTime.UtcNow
            },
            cancellationToken);
    }
}
