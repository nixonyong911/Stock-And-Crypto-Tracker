namespace StockTracker.Data.Entities;

/// <summary>
/// Earnings calendar tracking upcoming and historical earnings dates.
/// Used to track when companies release quarterly financial reports.
/// </summary>
public class AnalysisEarningsCalendar
{
    public int Id { get; set; }

    /// <summary>Foreign key to stock_tickers.</summary>
    public int StockTickerId { get; set; }

    /// <summary>Earnings announcement date.</summary>
    public DateOnly EarningsDate { get; set; }

    /// <summary>
    /// True if date is an estimate, false if confirmed/actual.
    /// Becomes false after earnings are released.
    /// </summary>
    public bool IsEstimate { get; set; } = true;

    // ===== Pre-Earnings Estimates =====

    /// <summary>Consensus EPS estimate before earnings release.</summary>
    public decimal? EpsEstimate { get; set; }

    /// <summary>Consensus revenue estimate in USD before earnings release.</summary>
    public decimal? RevenueEstimate { get; set; }

    // ===== Post-Earnings Actuals =====

    /// <summary>Actual reported EPS after earnings release.</summary>
    public decimal? EpsActual { get; set; }

    /// <summary>Actual reported revenue in USD after earnings release.</summary>
    public decimal? RevenueActual { get; set; }

    /// <summary>EPS surprise (actual - estimate).</summary>
    public decimal? EpsSurprise { get; set; }

    /// <summary>EPS surprise as percentage ((actual - estimate) / estimate * 100).</summary>
    public decimal? EpsSurprisePercent { get; set; }

    // ===== Metadata =====

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public StockTicker StockTicker { get; set; } = null!;
}
