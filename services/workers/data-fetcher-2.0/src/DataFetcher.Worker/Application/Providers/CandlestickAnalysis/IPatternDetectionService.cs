using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Service for detecting candlestick patterns.
/// </summary>
public interface IPatternDetectionService
{
    /// <summary>
    /// Detect all single-candle patterns in a daily candle.
    /// </summary>
    List<CandlestickPattern> DetectPatterns(IDailyCandle candle);
}
