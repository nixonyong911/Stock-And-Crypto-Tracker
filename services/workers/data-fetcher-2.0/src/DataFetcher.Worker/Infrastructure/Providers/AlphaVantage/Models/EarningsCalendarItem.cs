namespace DataFetcher.Worker.Infrastructure.Providers.AlphaVantage.Models;

/// <summary>
/// Represents an earnings calendar item from Alpha Vantage API.
/// </summary>
public class EarningsCalendarItem
{
    /// <summary>
    /// Stock symbol (e.g., "NVDA").
    /// </summary>
    public string Symbol { get; set; } = string.Empty;

    /// <summary>
    /// Company name (e.g., "NVIDIA Corp").
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Earnings report date.
    /// </summary>
    public DateOnly ReportDate { get; set; }

    /// <summary>
    /// Fiscal quarter end date.
    /// </summary>
    public DateOnly FiscalDateEnding { get; set; }

    /// <summary>
    /// EPS estimate.
    /// </summary>
    public decimal? Estimate { get; set; }

    /// <summary>
    /// Currency (e.g., "USD").
    /// </summary>
    public string Currency { get; set; } = "USD";

    /// <summary>
    /// Time of day for earnings report ("bmo" = before market open, "amc" = after market close).
    /// </summary>
    public string TimeOfTheDay { get; set; } = string.Empty;
}
