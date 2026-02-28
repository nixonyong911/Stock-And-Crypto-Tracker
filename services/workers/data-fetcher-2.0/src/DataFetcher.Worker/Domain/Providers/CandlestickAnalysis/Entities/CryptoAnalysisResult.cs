namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Complete analysis result for a single crypto ticker on a single day.
/// </summary>
public class CryptoAnalysisResult
{
    public int CryptoTickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateOnly AnalysisDate { get; set; }

    public decimal? DailyOpen { get; set; }
    public decimal? DailyHigh { get; set; }
    public decimal? DailyLow { get; set; }
    public decimal? DailyClose { get; set; }
    public decimal? DailyVolume { get; set; }

    public decimal? BodySize { get; set; }
    public decimal? RangeSize { get; set; }
    public decimal? UpperWick { get; set; }
    public decimal? LowerWick { get; set; }
    public bool? IsBullish { get; set; }

    public List<CandlestickPattern> DetectedPatterns { get; set; } = new();

    public int CandlesAggregated { get; set; }
    public string AnalysisVersion { get; set; } = "1.0.0";

    public static CryptoAnalysisResult FromCandle(CryptoDailyCandle candle, List<CandlestickPattern> patterns)
    {
        return new CryptoAnalysisResult
        {
            CryptoTickerId = candle.CryptoTickerId,
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
            CandlesAggregated = candle.CandlesAggregated
        };
    }
}

/// <summary>
/// Result of a batch crypto analysis operation.
/// </summary>
public class CryptoBatchAnalysisResult
{
    public bool Success { get; set; }
    public int TotalCrypto { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int PatternsDetected { get; set; }
    public DateOnly AnalysisDate { get; set; }
    public double DurationSeconds { get; set; }
    public List<CryptoAnalysisResult> Results { get; set; } = new();
    public List<string> Errors { get; set; } = new();
}
