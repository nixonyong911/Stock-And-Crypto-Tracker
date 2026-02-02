namespace YahooFinance.Worker.Models;

/// <summary>
/// Earnings calendar data to be inserted into analysis_earnings_calendar.
/// </summary>
public class EarningsData
{
    public int StockTickerId { get; set; }
    public DateOnly EarningsDate { get; set; }
    public bool IsEstimate { get; set; } = true;

    // Pre-earnings estimates
    public decimal? EpsEstimate { get; set; }
    public decimal? RevenueEstimate { get; set; }

    // Post-earnings actuals
    public decimal? EpsActual { get; set; }
    public decimal? RevenueActual { get; set; }
    public decimal? EpsSurprise { get; set; }
    public decimal? EpsSurprisePercent { get; set; }
}
