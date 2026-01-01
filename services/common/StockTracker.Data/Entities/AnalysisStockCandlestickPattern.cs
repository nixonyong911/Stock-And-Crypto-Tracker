namespace StockTracker.Data.Entities;

/// <summary>
/// Daily candlestick pattern analysis results.
/// Each row contains the aggregated daily candle and detected patterns for one stock on one date.
/// </summary>
public class AnalysisStockCandlestickPattern
{
    public long Id { get; set; }
    public int StockTickerId { get; set; }
    
    /// <summary>
    /// The date being analyzed (aggregated from 15-min candles).
    /// </summary>
    public DateOnly AnalysisDate { get; set; }
    
    // Daily aggregated OHLCV candle
    public decimal? DailyOpen { get; set; }
    public decimal? DailyHigh { get; set; }
    public decimal? DailyLow { get; set; }
    public decimal? DailyClose { get; set; }
    public long? DailyVolume { get; set; }
    
    // Pre-computed candle characteristics
    public decimal? BodySize { get; set; }
    public decimal? RangeSize { get; set; }
    public decimal? UpperWick { get; set; }
    public decimal? LowerWick { get; set; }
    public bool? IsBullish { get; set; }
    
    /// <summary>
    /// Detected patterns as JSONB array.
    /// Example: [{"pattern": "doji", "confidence": 0.92, "signal": "indecision"}]
    /// </summary>
    public string DetectedPatterns { get; set; } = "[]";
    
    /// <summary>
    /// Number of 15-minute candles aggregated to form the daily candle.
    /// </summary>
    public int CandlesAggregated { get; set; }
    
    /// <summary>
    /// Version of the analysis algorithm used.
    /// </summary>
    public string AnalysisVersion { get; set; } = "1.0.0";
    
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public StockTicker StockTicker { get; set; } = null!;
}

