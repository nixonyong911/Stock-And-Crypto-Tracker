using CandlestickAnalysis.Worker.Models;

namespace CandlestickAnalysis.Worker.Services;

/// <summary>
/// Service for detecting candlestick patterns.
/// </summary>
public interface IPatternDetectionService
{
    /// <summary>
    /// Detect all single-candle patterns in a daily candle.
    /// </summary>
    List<CandlestickPattern> DetectPatterns(DailyCandle candle);
}

