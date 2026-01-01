namespace CandlestickAnalysis.Worker.Models;

/// <summary>
/// Represents a daily OHLCV candle aggregated from 15-minute candles.
/// </summary>
public class DailyCandle
{
    public int StockTickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateOnly AnalysisDate { get; set; }
    
    // OHLCV
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Close { get; set; }
    public long Volume { get; set; }
    
    // Pre-computed characteristics
    public decimal BodySize => Math.Abs(Close - Open);
    public decimal RangeSize => High - Low;
    public decimal UpperWick => High - Math.Max(Open, Close);
    public decimal LowerWick => Math.Min(Open, Close) - Low;
    public bool IsBullish => Close > Open;
    
    /// <summary>
    /// Number of 15-minute candles aggregated.
    /// </summary>
    public int CandlesAggregated { get; set; }
}

