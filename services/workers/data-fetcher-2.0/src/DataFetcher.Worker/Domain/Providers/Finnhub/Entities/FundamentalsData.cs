namespace DataFetcher.Worker.Domain.Providers.Finnhub.Entities;

/// <summary>
/// Fundamental data for a stock ticker from Finnhub API.
/// Maps to analysis_stock_fundamentals table.
/// </summary>
public class FundamentalsData
{
    public int Id { get; set; }
    public int StockTickerId { get; set; }
    public int FiscalYear { get; set; }
    public string FiscalQuarter { get; set; } = string.Empty;

    // Valuation Metrics
    public decimal? MarketCap { get; set; }
    public decimal? PeRatio { get; set; }
    public decimal? ForwardPe { get; set; }
    public decimal? PegRatio { get; set; }
    public decimal? FcfYield { get; set; }

    // Profitability Metrics
    public decimal? Roe { get; set; }
    public decimal? Roic { get; set; }
    public decimal? OperatingMargin { get; set; }

    // Growth Metrics
    public decimal? RevenueTtm { get; set; }
    public decimal? RevenueGrowthYoy { get; set; }
    public decimal? EpsTtm { get; set; }
    public decimal? EpsGrowthYoy { get; set; }

    // Stability Metrics
    public decimal? DebtToEquity { get; set; }
    public decimal? InterestCoverage { get; set; }

    // Cash Flow Metrics
    public decimal? FreeCashFlow { get; set; }
    public decimal? FcfGrowthYoy { get; set; }

    // Shareholder Value
    public decimal? DividendYield { get; set; }

    // Metadata
    public string DataSource { get; set; } = "Finnhub";
    public DateTime LastFetchedAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
