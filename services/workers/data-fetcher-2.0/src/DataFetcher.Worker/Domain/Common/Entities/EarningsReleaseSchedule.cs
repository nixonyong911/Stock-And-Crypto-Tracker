namespace DataFetcher.Worker.Domain.Common.Entities;

/// <summary>
/// Earnings release schedule for a stock ticker.
/// Maps to analysis_earnings_release_schedule table.
/// Shared across providers (Alpha Vantage, etc.).
/// </summary>
public class EarningsReleaseSchedule
{
    public int Id { get; set; }
    public int StockTickerId { get; set; }
    public DateOnly EarningsDate { get; set; }
    public int? FiscalYear { get; set; }
    public string? FiscalQuarter { get; set; }
    public bool? IsEstimate { get; set; }
    public decimal? EpsEstimate { get; set; }
    public decimal? RevenueEstimate { get; set; }
    public decimal? EpsActual { get; set; }
    public decimal? RevenueActual { get; set; }
    public decimal? EpsSurprise { get; set; }
    public decimal? EpsSurprisePercent { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
