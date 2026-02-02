namespace StockTracker.Data.Entities;

/// <summary>
/// Company fundamental data for mid-to-long-term stock analysis.
/// Single row per ticker - upserted on each daily fetch from Yahoo Finance.
/// </summary>
public class AnalysisStockFundamentals
{
    public int Id { get; set; }

    /// <summary>
    /// Foreign key to stock_tickers. Unique constraint ensures single row per ticker.
    /// </summary>
    public int StockTickerId { get; set; }

    // ===== Valuation Metrics (change daily with price) =====

    /// <summary>Market capitalization in USD.</summary>
    public decimal? MarketCap { get; set; }

    /// <summary>Price-to-Earnings ratio (trailing twelve months).</summary>
    public decimal? PeRatio { get; set; }

    /// <summary>Forward Price-to-Earnings ratio (based on estimates).</summary>
    public decimal? ForwardPe { get; set; }

    /// <summary>Price/Earnings to Growth ratio.</summary>
    public decimal? PegRatio { get; set; }

    /// <summary>Price-to-Book ratio.</summary>
    public decimal? PriceToBook { get; set; }

    /// <summary>Price-to-Sales ratio.</summary>
    public decimal? PriceToSales { get; set; }

    /// <summary>Enterprise value in USD.</summary>
    public decimal? EnterpriseValue { get; set; }

    // ===== Financial Health (change quarterly) =====

    /// <summary>Earnings per share (trailing twelve months).</summary>
    public decimal? EpsTtm { get; set; }

    /// <summary>Revenue (trailing twelve months) in USD.</summary>
    public decimal? RevenueTtm { get; set; }

    /// <summary>Gross profit margin as decimal (e.g., 0.45 = 45%).</summary>
    public decimal? GrossMargin { get; set; }

    /// <summary>Operating profit margin as decimal.</summary>
    public decimal? OperatingMargin { get; set; }

    /// <summary>Net profit margin as decimal.</summary>
    public decimal? ProfitMargin { get; set; }

    /// <summary>Total debt to equity ratio.</summary>
    public decimal? DebtToEquity { get; set; }

    /// <summary>Current assets to current liabilities ratio.</summary>
    public decimal? CurrentRatio { get; set; }

    // ===== Price Metrics =====

    /// <summary>52-week high price.</summary>
    public decimal? FiftyTwoWeekHigh { get; set; }

    /// <summary>52-week low price.</summary>
    public decimal? FiftyTwoWeekLow { get; set; }

    /// <summary>50-day moving average price.</summary>
    public decimal? FiftyDayAverage { get; set; }

    /// <summary>200-day moving average price.</summary>
    public decimal? TwoHundredDayAverage { get; set; }

    /// <summary>Beta coefficient (5Y monthly vs S&P 500).</summary>
    public decimal? Beta { get; set; }

    // ===== Dividend Information =====

    /// <summary>Annual dividend yield as decimal (e.g., 0.02 = 2%).</summary>
    public decimal? DividendYield { get; set; }

    /// <summary>Annual dividend rate in USD per share.</summary>
    public decimal? DividendRate { get; set; }

    /// <summary>Ex-dividend date.</summary>
    public DateOnly? ExDividendDate { get; set; }

    /// <summary>Dividend payout ratio as decimal.</summary>
    public decimal? PayoutRatio { get; set; }

    // ===== Analyst Estimates =====

    /// <summary>Mean analyst 1-year target price.</summary>
    public decimal? TargetMeanPrice { get; set; }

    /// <summary>Highest analyst 1-year target price.</summary>
    public decimal? TargetHighPrice { get; set; }

    /// <summary>Lowest analyst 1-year target price.</summary>
    public decimal? TargetLowPrice { get; set; }

    /// <summary>
    /// Mean analyst recommendation (1=Strong Buy, 2=Buy, 3=Hold, 4=Sell, 5=Strong Sell).
    /// </summary>
    public decimal? RecommendationMean { get; set; }

    /// <summary>Number of analysts covering this stock.</summary>
    public int? NumberOfAnalysts { get; set; }

    // ===== Metadata =====

    /// <summary>Timestamp of last successful data fetch.</summary>
    public DateTime LastFetchedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public StockTicker StockTicker { get; set; } = null!;
}
