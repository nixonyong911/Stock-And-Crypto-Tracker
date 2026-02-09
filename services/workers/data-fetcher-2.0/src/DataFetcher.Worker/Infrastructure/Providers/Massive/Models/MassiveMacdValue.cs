namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Models;

/// <summary>
/// A single data point from a Massive MACD indicator response.
/// </summary>
public class MassiveMacdValue
{
    /// <summary>
    /// The Unix millisecond timestamp for this data point.
    /// </summary>
    public long Timestamp { get; set; }

    /// <summary>
    /// The MACD line value (difference between short and long EMA).
    /// </summary>
    public decimal Value { get; set; }

    /// <summary>
    /// The signal line value (EMA of the MACD line).
    /// </summary>
    public decimal Signal { get; set; }

    /// <summary>
    /// The histogram value (MACD line minus signal line).
    /// </summary>
    public decimal Histogram { get; set; }
}
