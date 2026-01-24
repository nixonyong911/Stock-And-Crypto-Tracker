using System.Text.Json.Serialization;

namespace TwelveData.Worker.Models;

/// <summary>
/// Message model for RabbitMQ backfill queue
/// </summary>
public class BackfillRequest
{
    /// <summary>
    /// Stock symbol to backfill (e.g., "AAPL", "MSFT")
    /// </summary>
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    /// <summary>
    /// Exchange for the symbol (e.g., "NASDAQ", "NYSE")
    /// </summary>
    [JsonPropertyName("exchange")]
    public string Exchange { get; set; } = "NASDAQ";

    /// <summary>
    /// Timestamp when the request was created
    /// </summary>
    [JsonPropertyName("requested_at")]
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Optional: Stock ticker ID from database (if known)
    /// </summary>
    [JsonPropertyName("ticker_id")]
    public int? TickerId { get; set; }
}

/// <summary>
/// Response model for backfill API endpoint
/// </summary>
public class BackfillResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Symbol { get; set; }
    public string? QueuePosition { get; set; }
    public DateTime? QueuedAt { get; set; }
}

/// <summary>
/// Result model for backfill operation
/// </summary>
public class BackfillResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int TotalRecordsInserted { get; set; }
    public int BatchesProcessed { get; set; }
    public TimeSpan Duration { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Supabase database webhook payload model
/// Sent when a row is inserted/updated/deleted in stock_tickers table
/// </summary>
public class SupabaseWebhookPayload
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;  // INSERT, UPDATE, DELETE

    [JsonPropertyName("table")]
    public string Table { get; set; } = string.Empty;

    [JsonPropertyName("schema")]
    public string Schema { get; set; } = string.Empty;

    [JsonPropertyName("record")]
    public TickerRecord? Record { get; set; }

    [JsonPropertyName("old_record")]
    public TickerRecord? OldRecord { get; set; }
}

/// <summary>
/// Record from stock_tickers table
/// </summary>
public class TickerRecord
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("exchange")]
    public string? Exchange { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("created_at")]
    public DateTime? CreatedAt { get; set; }
}
