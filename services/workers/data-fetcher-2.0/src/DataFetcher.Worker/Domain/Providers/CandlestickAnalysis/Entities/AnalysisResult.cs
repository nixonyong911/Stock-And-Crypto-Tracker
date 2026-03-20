namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Complete analysis result for a single stock on a single day.
/// </summary>
public class AnalysisResult
{
    public int StockTickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateOnly AnalysisDate { get; set; }

    // Daily aggregated candle
    public decimal? DailyOpen { get; set; }
    public decimal? DailyHigh { get; set; }
    public decimal? DailyLow { get; set; }
    public decimal? DailyClose { get; set; }
    public long? DailyVolume { get; set; }

    // Candle characteristics
    public decimal? BodySize { get; set; }
    public decimal? RangeSize { get; set; }
    public decimal? UpperWick { get; set; }
    public decimal? LowerWick { get; set; }
    public bool? IsBullish { get; set; }

    // Detected patterns
    public List<CandlestickPattern> DetectedPatterns { get; set; } = new();

    // Metadata
    public int CandlesAggregated { get; set; }
    public string AnalysisVersion { get; set; } = "1.0.0";

    // Multi-timeframe fields
    public string Timeframe { get; set; } = "daily";
    public bool IsConfirmed { get; set; } = true;
    public decimal Confidence { get; set; } = 1.00m;

    /// <summary>
    /// Create from daily candle and detected patterns.
    /// </summary>
    public static AnalysisResult FromCandle(DailyCandle candle, List<CandlestickPattern> patterns)
    {
        return new AnalysisResult
        {
            StockTickerId = candle.StockTickerId,
            Symbol = candle.Symbol,
            AnalysisDate = candle.AnalysisDate,
            DailyOpen = candle.Open,
            DailyHigh = candle.High,
            DailyLow = candle.Low,
            DailyClose = candle.Close,
            DailyVolume = candle.Volume,
            BodySize = candle.BodySize,
            RangeSize = candle.RangeSize,
            UpperWick = candle.UpperWick,
            LowerWick = candle.LowerWick,
            IsBullish = candle.IsBullish,
            DetectedPatterns = patterns,
            CandlesAggregated = candle.CandlesAggregated,
            Timeframe = candle.Timeframe,
            IsConfirmed = candle.IsConfirmed,
            Confidence = candle.Confidence
        };
    }
}

/// <summary>
/// Result of a batch analysis operation.
/// </summary>
public class BatchAnalysisResult
{
    public bool Success { get; set; }
    public int TotalStocks { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int PatternsDetected { get; set; }
    public DateOnly AnalysisDate { get; set; }
    public double DurationSeconds { get; set; }
    public List<AnalysisResult> Results { get; set; } = new();
    public List<string> Errors { get; set; } = new();
}
