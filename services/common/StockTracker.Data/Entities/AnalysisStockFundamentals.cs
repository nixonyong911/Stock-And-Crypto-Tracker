namespace StockTracker.Data.Entities;

/// <summary>
/// Company fundamental data for mid-to-long-term stock analysis.
/// Single row per ticker - upserted on each fetch from SimFin.
/// </summary>
public class AnalysisStockFundamentals
{
    public int Id { get; set; }

    /// <summary>
    /// Foreign key to stock_tickers. Unique constraint ensures single row per ticker.
    /// </summary>
    public int StockTickerId { get; set; }

    // ===== Valuation Metrics =====

    /// <summary>Market capitalization in USD.</summary>
    public decimal? MarketCap { get; set; }

    /// <summary>Price-to-Earnings ratio (trailing twelve months).</summary>
    public decimal? PeRatio { get; set; }

    /// <summary>Price-to-Book ratio.</summary>
    public decimal? PriceToBook { get; set; }

    /// <summary>Price-to-Sales ratio.</summary>
    public decimal? PriceToSales { get; set; }

    /// <summary>Enterprise value in USD.</summary>
    public decimal? EnterpriseValue { get; set; }

    // ===== Per Share Data =====

    /// <summary>Earnings per share (trailing twelve months).</summary>
    public decimal? EpsTtm { get; set; }

    /// <summary>Book value per share in USD.</summary>
    public decimal? BookValuePerShare { get; set; }

    // ===== Revenue & Profitability =====

    /// <summary>Revenue (trailing twelve months) in USD.</summary>
    public decimal? RevenueTtm { get; set; }

    /// <summary>Gross profit margin as decimal (e.g., 0.45 = 45%).</summary>
    public decimal? GrossMargin { get; set; }

    /// <summary>Operating profit margin as decimal.</summary>
    public decimal? OperatingMargin { get; set; }

    /// <summary>Net profit margin as decimal.</summary>
    public decimal? ProfitMargin { get; set; }

    // ===== Returns =====

    /// <summary>Return on equity as decimal (e.g., 0.15 = 15%).</summary>
    public decimal? ReturnOnEquity { get; set; }

    /// <summary>Return on assets as decimal (e.g., 0.08 = 8%).</summary>
    public decimal? ReturnOnAssets { get; set; }

    // ===== Financial Health =====

    /// <summary>Total debt to equity ratio.</summary>
    public decimal? DebtToEquity { get; set; }

    /// <summary>Current assets to current liabilities ratio.</summary>
    public decimal? CurrentRatio { get; set; }

    // ===== Dividends =====

    /// <summary>Annual dividend yield as decimal (e.g., 0.02 = 2%).</summary>
    public decimal? DividendYield { get; set; }

    /// <summary>Dividend payout ratio as decimal.</summary>
    public decimal? PayoutRatio { get; set; }

    // ===== Balance Sheet Summary =====

    /// <summary>Total assets in USD.</summary>
    public decimal? TotalAssets { get; set; }

    /// <summary>Total liabilities in USD.</summary>
    public decimal? TotalLiabilities { get; set; }

    /// <summary>Total shareholders' equity in USD.</summary>
    public decimal? TotalEquity { get; set; }

    /// <summary>Free cash flow in USD.</summary>
    public decimal? FreeCashFlow { get; set; }

    /// <summary>Number of shares outstanding.</summary>
    public long? SharesOutstanding { get; set; }

    // ===== Report Metadata =====

    /// <summary>Fiscal year of the most recent report (e.g., 2024).</summary>
    public int? FiscalYear { get; set; }

    /// <summary>Fiscal period (e.g., "FY", "Q1", "Q2", "Q3", "Q4").</summary>
    public string? FiscalPeriod { get; set; }

    /// <summary>Date of the financial report.</summary>
    public DateOnly? ReportDate { get; set; }

    /// <summary>Data source identifier (default: "simfin").</summary>
    public string DataSource { get; set; } = "simfin";

    // ===== Timestamps =====

    /// <summary>Timestamp of last successful data fetch.</summary>
    public DateTime LastFetchedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public StockTicker StockTicker { get; set; } = null!;
}
