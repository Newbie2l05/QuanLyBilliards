using System.Text.Json;
using Dapper;

namespace BidaCSharp.Services;

public sealed class PricingService
{
    public async Task<PricingConfig> GetConfigAsync(System.Data.IDbConnection connection, System.Data.IDbTransaction? transaction = null)
    {
        var raw = await connection.ExecuteScalarAsync<string?>(
            "SELECT setting_value FROM settings WHERE setting_key = 'pricing_config' LIMIT 1",
            transaction: transaction);

        return PricingConfig.FromRaw(raw);
    }

    public async Task<PricingBreakdown> CalculateAsync(
        System.Data.IDbConnection connection,
        System.Data.IDbTransaction? transaction,
        DateTime startTime,
        DateTime endTime,
        string? tableType,
        decimal fallbackPricePerHour,
        int? comboHours,
        decimal? comboPrice)
    {
        var config = await GetConfigAsync(connection, transaction);
        return Calculate(config, startTime, endTime, tableType, fallbackPricePerHour, comboHours, comboPrice);
    }

    public PricingBreakdown Calculate(
        PricingConfig config,
        DateTime startTime,
        DateTime endTime,
        string? tableType,
        decimal fallbackPricePerHour,
        int? comboHours,
        decimal? comboPrice)
    {
        if (endTime <= startTime)
        {
            return new PricingBreakdown(0, 0, comboPrice ?? 0, 0, Array.Empty<PricingSegment>());
        }

        var totalMinutes = (int)Math.Ceiling((endTime - startTime).TotalMinutes);
        var safeTableType = string.Equals(tableType, "vip", StringComparison.OrdinalIgnoreCase) ? "vip" : "standard";
        var comboDurationMinutes = Math.Max(0, (comboHours ?? 0) * 60);
        var comboTotal = Math.Max(0, comboPrice ?? 0);

        if (comboDurationMinutes > 0 && comboTotal > 0)
        {
            var comboCoveredMinutes = Math.Min(totalMinutes, comboDurationMinutes);
            var extraStart = startTime.AddMinutes(comboCoveredMinutes);
            var extraAmount = CalculateFlexibleAmount(config, extraStart, endTime, safeTableType, fallbackPricePerHour, out var extraSegments);

            return new PricingBreakdown(
                totalMinutes,
                comboCoveredMinutes,
                comboTotal,
                extraAmount,
                extraSegments);
        }

        var baseAmount = CalculateFlexibleAmount(config, startTime, endTime, safeTableType, fallbackPricePerHour, out var segments);
        return new PricingBreakdown(totalMinutes, 0, 0, baseAmount, segments);
    }

    private static decimal CalculateFlexibleAmount(
        PricingConfig config,
        DateTime startTime,
        DateTime endTime,
        string tableType,
        decimal fallbackPricePerHour,
        out IReadOnlyList<PricingSegment> segments)
    {
        var segmentList = new List<PricingSegment>();
        if (endTime <= startTime)
        {
            segments = segmentList;
            return 0;
        }

        if (!config.enabled || config.slots.Count == 0)
        {
            var totalMinutes = (decimal)Math.Ceiling((endTime - startTime).TotalMinutes);
            var amount = Math.Ceiling(totalMinutes / 60m * fallbackPricePerHour);
            segmentList.Add(new PricingSegment("Giờ chuẩn", (int)totalMinutes, fallbackPricePerHour, amount));
            segments = segmentList;
            return amount;
        }

        decimal total = 0;
        var cursor = startTime;
        while (cursor < endTime)
        {
            var next = cursor.AddMinutes(1);
            if (next > endTime)
            {
                next = endTime;
            }

            var matchedSlot = config.slots.FirstOrDefault(slot => slot.IsMatch(cursor));
            var rate = matchedSlot?.GetPrice(tableType) ?? fallbackPricePerHour;
            var label = matchedSlot?.name ?? "Giờ chuẩn";
            var minuteAmount = rate * (decimal)(next - cursor).TotalMinutes / 60m;
            total += minuteAmount;

            if (segmentList.Count > 0 && segmentList[^1].label == label && segmentList[^1].rate_per_hour == rate)
            {
                var previous = segmentList[^1];
                segmentList[^1] = previous with
                {
                    minutes = previous.minutes + (int)Math.Round((next - cursor).TotalMinutes),
                    amount = previous.amount + minuteAmount
                };
            }
            else
            {
                segmentList.Add(new PricingSegment(label, (int)Math.Round((next - cursor).TotalMinutes), rate, minuteAmount));
            }

            cursor = next;
        }

        segments = segmentList
            .Select(segment => segment with { amount = Math.Round(segment.amount, 0, MidpointRounding.AwayFromZero) })
            .ToArray();
        return Math.Round(total, 0, MidpointRounding.AwayFromZero);
    }
}

public sealed class PricingConfig
{
    public bool enabled { get; init; }
    public List<PricingSlot> slots { get; init; } = [];

    public static PricingConfig FromRaw(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new PricingConfig { enabled = false };
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<PricingConfig>(raw, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed is null)
            {
                return new PricingConfig { enabled = false };
            }

            return new PricingConfig
            {
                enabled = parsed.enabled,
                slots = parsed.slots
                    .Where(slot => !string.IsNullOrWhiteSpace(slot.start) && !string.IsNullOrWhiteSpace(slot.end))
                    .ToList()
            };
        }
        catch
        {
            return new PricingConfig { enabled = false };
        }
    }
}

public sealed class PricingSlot
{
    public int id { get; init; }
    public string name { get; init; } = string.Empty;
    public string start { get; init; } = "00:00";
    public string end { get; init; } = "23:59";
    public List<int> days { get; init; } = [];
    public decimal standard_price { get; init; }
    public decimal vip_price { get; init; }

    public bool IsMatch(DateTime value)
    {
        var day = (int)value.DayOfWeek;
        if (days.Count > 0 && !days.Contains(day))
        {
            return false;
        }

        if (!TimeSpan.TryParse(start, out var startTime) || !TimeSpan.TryParse(end, out var endTime))
        {
            return false;
        }

        var current = value.TimeOfDay;
        if (endTime > startTime)
        {
            return current >= startTime && current < endTime;
        }

        return current >= startTime || current < endTime;
    }

    public decimal GetPrice(string tableType)
        => string.Equals(tableType, "vip", StringComparison.OrdinalIgnoreCase)
            ? Math.Max(0, vip_price)
            : Math.Max(0, standard_price);
}

public sealed record PricingBreakdown(
    int total_minutes,
    int combo_minutes,
    decimal combo_amount,
    decimal time_based_amount,
    IReadOnlyList<PricingSegment> segments)
{
    public decimal total_amount => combo_amount + time_based_amount;
}

public sealed record PricingSegment(string label, int minutes, decimal rate_per_hour, decimal amount);
