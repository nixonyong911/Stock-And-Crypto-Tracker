namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Models;

/// <summary>
/// A single data point from a Massive indicator response (SMA, EMA, RSI).
/// </summary>
public class MassiveIndicatorValue
{
    /// <summary>
    /// The Unix millisecond timestamp for this data point.
    /// </summary>
    public long Timestamp { get; set; }

    /// <summary>
    /// The computed indicator value at this timestamp.
    /// </summary>
    public decimal Value { get; set; }
}
