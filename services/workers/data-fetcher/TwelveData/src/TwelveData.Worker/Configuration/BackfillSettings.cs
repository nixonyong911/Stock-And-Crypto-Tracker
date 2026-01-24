namespace TwelveData.Worker.Configuration;

/// <summary>
/// Configuration settings for historical data backfill
/// </summary>
public class BackfillSettings
{
    /// <summary>
    /// Trading minutes per day (US market: 9:30 AM - 4:00 PM = 390 minutes)
    /// </summary>
    public int TradingMinutesPerDay { get; set; } = 390;

    /// <summary>
    /// Approximate trading days per month (using 22 for safety margin)
    /// </summary>
    public int TradingDaysPerMonth { get; set; } = 22;

    /// <summary>
    /// Number of months of historical data to backfill
    /// </summary>
    public int MonthsToBackfill { get; set; } = 6;

    /// <summary>
    /// Maximum output size per TwelveData API request
    /// </summary>
    public int MaxOutputSizePerRequest { get; set; } = 5000;

    /// <summary>
    /// Interval in minutes for candle data (e.g., 15 for 15-minute candles)
    /// </summary>
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>
    /// Delay in seconds between API calls for rate limiting
    /// </summary>
    public int RateLimitDelaySeconds { get; set; } = 8;

    /// <summary>
    /// Calculates the total data points needed for the configured backfill period
    /// Formula: (TradingMinutesPerDay / IntervalMinutes) * TradingDaysPerMonth * MonthsToBackfill
    /// </summary>
    public int CalculateTotalDataPoints()
    {
        return (TradingMinutesPerDay / IntervalMinutes) * TradingDaysPerMonth * MonthsToBackfill;
    }

    /// <summary>
    /// Determines if batching is required (total data points exceeds max per request)
    /// </summary>
    public bool RequiresBatching()
    {
        return CalculateTotalDataPoints() > MaxOutputSizePerRequest;
    }

    /// <summary>
    /// Gets the interval string for TwelveData API (e.g., "15min")
    /// </summary>
    public string GetIntervalString()
    {
        return $"{IntervalMinutes}min";
    }
}
