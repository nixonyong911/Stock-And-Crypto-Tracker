namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Long-horizon trend metrics for a stock-universe ticker (stocks, indexes,
/// ETFs), computed from eToro OneDay candles. Maps to
/// analysis_stock_trend_metrics. Carries both the 52-week range (covers
/// instruments without Finnhub fundamentals, e.g. SPX500) and the long
/// moving averages that power the Smart Digest regime pillar.
/// </summary>
public class StockTrendMetrics
{
    public int StockTickerId { get; set; }
    public decimal Week52High { get; set; }
    public decimal Week52Low { get; set; }
    public DateOnly? Week52HighDate { get; set; }
    public DateOnly? Week52LowDate { get; set; }
    /// <summary>50-day simple MA; null when under 50 daily bars exist.</summary>
    public decimal? Sma50 { get; set; }
    /// <summary>200-day simple MA; null when under 200 daily bars exist.</summary>
    public decimal? Sma200 { get; set; }
    /// <summary>True daily EMA-50; null when under 200 bars (seed not converged).</summary>
    public decimal? Ema50 { get; set; }
    /// <summary>Daily bars inside the trailing 365 days the range was computed from.</summary>
    public int CoverageDays { get; set; }
    public DateTime ComputedAt { get; set; } = DateTime.UtcNow;
}
