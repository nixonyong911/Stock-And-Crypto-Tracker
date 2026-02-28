namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Shared interface for daily candle data, enabling PatternDetectionService
/// to work with both stock and crypto candles.
/// </summary>
public interface IDailyCandle
{
    string Symbol { get; }
    decimal Open { get; }
    decimal High { get; }
    decimal Low { get; }
    decimal Close { get; }
    decimal BodySize { get; }
    decimal RangeSize { get; }
    decimal UpperWick { get; }
    decimal LowerWick { get; }
    bool IsBullish { get; }
}
