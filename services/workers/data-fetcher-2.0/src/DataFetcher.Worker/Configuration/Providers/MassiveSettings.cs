namespace DataFetcher.Worker.Configuration.Providers;

/// <summary>
/// Configuration settings for Massive technical indicator API.
/// </summary>
public class MassiveSettings
{
    /// <summary>
    /// Massive API key.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Base URL for Massive API.
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.massive.com/v1";

    /// <summary>
    /// Delay between API calls in milliseconds to respect rate limits.
    /// </summary>
    public int RateLimitDelayMs { get; set; } = 12000;

    /// <summary>
    /// Aggregate time window for indicator data (e.g. "minute", "hour", "day").
    /// </summary>
    public string Timespan { get; set; } = "minute";

    /// <summary>
    /// Maximum number of results per API call for daily fetches.
    /// </summary>
    public int Limit { get; set; } = 390;

    /// <summary>
    /// Maximum number of results per API call for backfill fetches.
    /// </summary>
    public int BackfillLimit { get; set; } = 5000;

    /// <summary>
    /// Number of days to backfill when populating historical indicator data.
    /// </summary>
    public int BackfillDays { get; set; } = 90;

    /// <summary>
    /// Window size for Simple Moving Average (SMA) calculation.
    /// </summary>
    public int SmaWindow { get; set; } = 20;

    /// <summary>
    /// Window size for Exponential Moving Average (EMA) calculation.
    /// </summary>
    public int EmaWindow { get; set; } = 20;

    /// <summary>
    /// Window size for Relative Strength Index (RSI) calculation.
    /// </summary>
    public int RsiWindow { get; set; } = 14;

    /// <summary>
    /// Short-period window for MACD calculation.
    /// </summary>
    public int MacdShortWindow { get; set; } = 12;

    /// <summary>
    /// Long-period window for MACD calculation.
    /// </summary>
    public int MacdLongWindow { get; set; } = 26;

    /// <summary>
    /// Signal line window for MACD calculation.
    /// </summary>
    public int MacdSignalWindow { get; set; } = 9;
}
