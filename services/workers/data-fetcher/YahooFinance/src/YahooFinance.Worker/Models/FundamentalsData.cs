namespace YahooFinance.Worker.Models;

/// <summary>
/// Fundamental data for a stock ticker to be inserted into analysis_stock_fundamentals.
/// </summary>
public class FundamentalsData
{
    public int StockTickerId { get; set; }

    // Valuation Metrics
    public decimal? MarketCap { get; set; }
    public decimal? PeRatio { get; set; }
    public decimal? ForwardPe { get; set; }
    public decimal? PegRatio { get; set; }
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

    // Price Metrics
    public decimal? FiftyTwoWeekHigh { get; set; }
    public decimal? FiftyTwoWeekLow { get; set; }
    public decimal? FiftyDayAverage { get; set; }
    public decimal? TwoHundredDayAverage { get; set; }
    public decimal? Beta { get; set; }

    // Dividend
    public decimal? DividendYield { get; set; }
    public decimal? DividendRate { get; set; }
    public DateOnly? ExDividendDate { get; set; }
    public decimal? PayoutRatio { get; set; }

    // Analyst
    public decimal? TargetMeanPrice { get; set; }
    public decimal? TargetHighPrice { get; set; }
    public decimal? TargetLowPrice { get; set; }
    public decimal? RecommendationMean { get; set; }
    public int? NumberOfAnalysts { get; set; }

    public DateTime LastFetchedAt { get; set; } = DateTime.UtcNow;
}
