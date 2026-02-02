namespace SimFin.Worker.Models;

/// <summary>
/// Fundamental data for a stock ticker from SimFin API.
/// Maps to analysis_stock_fundamentals table.
/// </summary>
public class FundamentalsData
{
    public int StockTickerId { get; set; }

    // Valuation Metrics
    public decimal? MarketCap { get; set; }
    public decimal? PeRatio { get; set; }
    public decimal? PriceToBook { get; set; }
    public decimal? PriceToSales { get; set; }
    public decimal? EnterpriseValue { get; set; }

    // Financial Health
    public decimal? EpsTtm { get; set; }
    public decimal? RevenueTtm { get; set; }
    public decimal? GrossMargin { get; set; }
    public decimal? OperatingMargin { get; set; }
    public decimal? ProfitMargin { get; set; }
    public decimal? DebtToEquity { get; set; }
    public decimal? CurrentRatio { get; set; }

    // SimFin-specific metrics
    public decimal? BookValuePerShare { get; set; }
    public decimal? ReturnOnEquity { get; set; }
    public decimal? ReturnOnAssets { get; set; }
    public decimal? TotalAssets { get; set; }
    public decimal? TotalLiabilities { get; set; }
    public decimal? TotalEquity { get; set; }
    public decimal? FreeCashFlow { get; set; }
    public long? SharesOutstanding { get; set; }

    // Dividend
    public decimal? DividendYield { get; set; }
    public decimal? PayoutRatio { get; set; }

    // Fiscal period info
    public int? FiscalYear { get; set; }
    public string? FiscalPeriod { get; set; }
    public DateOnly? ReportDate { get; set; }

    // Metadata
    public string DataSource { get; set; } = "SimFin";
    public DateTime LastFetchedAt { get; set; } = DateTime.UtcNow;
}
