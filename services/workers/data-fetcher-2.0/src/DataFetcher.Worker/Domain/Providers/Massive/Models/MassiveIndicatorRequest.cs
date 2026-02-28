using System.Text.Json.Serialization;

namespace DataFetcher.Worker.Domain.Providers.Massive.Models;

/// <summary>
/// RabbitMQ message model for requesting Massive indicator data.
/// </summary>
public class MassiveIndicatorRequest
{
    /// <summary>
    /// Request type: "daily" for single-day fetch or "backfill" for historical range.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    /// <summary>
    /// Stock ticker symbol (e.g. "AAPL").
    /// </summary>
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    /// <summary>
    /// Stock ticker ID from the stock_tickers table.
    /// </summary>
    [JsonPropertyName("tickerId")]
    public int TickerId { get; set; }

    /// <summary>
    /// Indicator type for per-indicator backfill: "sma", "ema", "macd", "rsi".
    /// Null for daily requests (which fetch all 4 indicators in one message).
    /// </summary>
    [JsonPropertyName("indicatorType")]
    public string? IndicatorType { get; set; }

    /// <summary>
    /// Target date for daily fetch in ISO format (e.g. "2026-02-06"). Null for backfill requests.
    /// </summary>
    [JsonPropertyName("targetDate")]
    public string? TargetDate { get; set; }

    /// <summary>
    /// Start date for backfill range in ISO format. Typically 90 days ago.
    /// </summary>
    [JsonPropertyName("startDate")]
    public string? StartDate { get; set; }

    /// <summary>
    /// End date for backfill range in ISO format. Typically yesterday.
    /// </summary>
    [JsonPropertyName("endDate")]
    public string? EndDate { get; set; }

    /// <summary>
    /// Asset type: "stock" (default) or "crypto".
    /// </summary>
    [JsonPropertyName("assetType")]
    public string AssetType { get; set; } = "stock";

    /// <summary>
    /// Timestamp when the request was created.
    /// </summary>
    [JsonPropertyName("requestedAt")]
    public DateTime RequestedAt { get; set; }
}
