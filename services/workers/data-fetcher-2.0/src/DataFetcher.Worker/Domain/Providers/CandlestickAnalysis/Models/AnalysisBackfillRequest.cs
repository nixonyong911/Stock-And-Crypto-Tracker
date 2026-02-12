using System.Text.Json.Serialization;

namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;

/// <summary>
/// Message model for RabbitMQ analysis backfill queue.
/// </summary>
public class AnalysisBackfillRequest
{
    /// <summary>
    /// Stock symbol to backfill analysis for (e.g., "AAPL", "MSFT").
    /// </summary>
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    /// <summary>
    /// Optional: Stock ticker ID from database (if known).
    /// </summary>
    [JsonPropertyName("ticker_id")]
    public int? TickerId { get; set; }

    /// <summary>
    /// Timestamp when the request was created.
    /// </summary>
    [JsonPropertyName("requested_at")]
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Optional: Override the default days to backfill.
    /// </summary>
    [JsonPropertyName("days_to_backfill")]
    public int? DaysToBackfill { get; set; }
}

/// <summary>
/// Response model for backfill API endpoint.
/// </summary>
public class AnalysisBackfillResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Symbol { get; set; }
    public DateTime? QueuedAt { get; set; }
}

/// <summary>
/// Result model for backfill operation.
/// </summary>
public class AnalysisBackfillResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int DatesAnalyzed { get; set; }
    public int DatesSkipped { get; set; }
    public int PatternsDetected { get; set; }
    public TimeSpan Duration { get; set; }
    public string? Error { get; set; }
}
