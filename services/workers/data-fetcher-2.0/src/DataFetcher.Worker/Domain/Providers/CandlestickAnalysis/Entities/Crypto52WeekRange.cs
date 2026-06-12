namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// 52-week price range for a crypto ticker, computed from Alpaca 1Day bars.
/// Maps to analysis_crypto_range_52w. Crypto counterpart of the Finnhub
/// week_52_* columns on analysis_stock_fundamentals.
/// </summary>
public class Crypto52WeekRange
{
    public int CryptoTickerId { get; set; }
    public decimal Week52High { get; set; }
    public decimal Week52Low { get; set; }
    public DateOnly? Week52HighDate { get; set; }
    public DateOnly? Week52LowDate { get; set; }
    /// <summary>Number of daily bars the range was computed from (≤ 365).</summary>
    public int CoverageDays { get; set; }
    public DateTime ComputedAt { get; set; } = DateTime.UtcNow;
}
