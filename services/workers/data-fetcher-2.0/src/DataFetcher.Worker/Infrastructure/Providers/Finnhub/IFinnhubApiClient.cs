namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub;

/// <summary>
/// Client for interacting with the Finnhub API.
/// </summary>
public interface IFinnhubApiClient
{
    /// <summary>
    /// Gets company profile data including market cap.
    /// </summary>
    Task<CompanyProfile?> GetCompanyProfileAsync(string symbol, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets basic financial metrics for a company.
    /// </summary>
    Task<BasicFinancials?> GetBasicFinancialsAsync(string symbol, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets reported financial statements.
    /// </summary>
    Task<FinancialsReported?> GetFinancialsReportedAsync(string symbol, string freq = "quarterly", CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets earnings calendar for a date range.
    /// </summary>
    Task<EarningsCalendar?> GetEarningsCalendarAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets earnings calendar for a specific symbol.
    /// </summary>
    Task<EarningsCalendar?> GetEarningsCalendarBySymbolAsync(string symbol, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets historical earnings data for a symbol (actuals + estimates).
    /// Uses /stock/earnings endpoint which provides past earnings with actuals.
    /// </summary>
    Task<List<StockEarning>?> GetStockEarningsAsync(string symbol, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets insider transactions for a symbol.
    /// </summary>
    Task<InsiderTransactionsResponse?> GetInsiderTransactionsAsync(string symbol, CancellationToken ct = default);

    /// <summary>
    /// Gets insider sentiment (MSPR) for a symbol over a date range.
    /// </summary>
    Task<InsiderSentimentResponse?> GetInsiderSentimentAsync(string symbol, string from, string to, CancellationToken ct = default);

    /// <summary>
    /// Gets analyst recommendation trends for a symbol.
    /// </summary>
    Task<List<RecommendationTrend>?> GetRecommendationTrendsAsync(string symbol, CancellationToken ct = default);

    /// <summary>
    /// Downloads the raw bytes of a company logo image from an absolute URL
    /// (as returned by <see cref="CompanyProfile.Logo"/>). Returns null on
    /// any failure so logo enrichment never blocks the fundamentals run.
    /// </summary>
    Task<byte[]?> GetCompanyLogoBytesAsync(string logoUrl, CancellationToken cancellationToken = default);
}

/// <summary>
/// Company profile response from Finnhub.
/// </summary>
public class CompanyProfile
{
    public string? Ticker { get; set; }
    public string? Name { get; set; }
    public decimal? MarketCapitalization { get; set; }
    public decimal? ShareOutstanding { get; set; }
    public string? Currency { get; set; }
    public string? Exchange { get; set; }
    public string? FinnhubIndustry { get; set; }
    public string? Ipo { get; set; }
    public string? Logo { get; set; }
    public string? Weburl { get; set; }
}

/// <summary>
/// Basic financials response from Finnhub.
/// </summary>
public class BasicFinancials
{
    public string? Symbol { get; set; }
    public Dictionary<string, object?>? Metric { get; set; }
}

/// <summary>
/// Financials reported response from Finnhub.
/// </summary>
public class FinancialsReported
{
    public string? Symbol { get; set; }
    public List<FinancialReport>? Data { get; set; }
}

/// <summary>
/// Individual financial report.
/// </summary>
public class FinancialReport
{
    public string? AccessNumber { get; set; }
    public string? Symbol { get; set; }
    public string? Cik { get; set; }
    public int? Year { get; set; }
    public int? Quarter { get; set; }
    public string? Form { get; set; }
    public string? StartDate { get; set; }
    public string? EndDate { get; set; }
    public string? FiledDate { get; set; }
    public string? AcceptedDate { get; set; }
    public ReportData? Report { get; set; }
}

/// <summary>
/// Report data containing financial statements.
/// </summary>
public class ReportData
{
    public List<FinancialItem>? Bs { get; set; } // Balance Sheet
    public List<FinancialItem>? Ic { get; set; } // Income Statement
    public List<FinancialItem>? Cf { get; set; } // Cash Flow
}

/// <summary>
/// Individual financial item.
/// </summary>
public class FinancialItem
{
    public string? Concept { get; set; }
    public string? Label { get; set; }
    public string? Unit { get; set; }
    public object? Value { get; set; } // Can be decimal or string (e.g., "N/A")
}

/// <summary>
/// Earnings calendar response from Finnhub.
/// </summary>
public class EarningsCalendar
{
    /// <summary>
    /// The earnings calendar data from Finnhub API (JSON: "earningsCalendar").
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("earningsCalendar")]
    public List<EarningsEvent>? EarningsCalendarData { get; set; }
}

/// <summary>
/// Individual earnings event.
/// </summary>
public class EarningsEvent
{
    public string? Date { get; set; }
    public decimal? EpsActual { get; set; }
    public decimal? EpsEstimate { get; set; }
    public string? Hour { get; set; }
    public int? Quarter { get; set; }
    public decimal? RevenueActual { get; set; }
    public decimal? RevenueEstimate { get; set; }
    public string? Symbol { get; set; }
    public int? Year { get; set; }
}

/// <summary>
/// Historical stock earnings from /stock/earnings endpoint.
/// Contains actual EPS and estimates for past quarters.
/// </summary>
public class StockEarning
{
    public decimal? Actual { get; set; }
    public decimal? Estimate { get; set; }
    public string? Period { get; set; }
    public int? Quarter { get; set; }
    public decimal? Surprise { get; set; }
    public decimal? SurprisePercent { get; set; }
    public string? Symbol { get; set; }
    public int Year { get; set; }

    // Convenience properties that map to standard names
    public decimal? EpsActual => Actual;
    public decimal? EpsEstimate => Estimate;
}

// ── Insider Transactions (from /stock/insider-transactions) ──
public class InsiderTransactionsResponse
{
    public List<InsiderTransaction>? Data { get; set; }
    public string? Symbol { get; set; }
}

public class InsiderTransaction
{
    public string? Name { get; set; }
    public long Share { get; set; }
    public decimal Change { get; set; }
    public string? Currency { get; set; }
    public string? FilingDate { get; set; }
    public string? TransactionDate { get; set; }
    public string? TransactionCode { get; set; }
    public decimal TransactionPrice { get; set; }
    public bool IsDerivative { get; set; }
    public string? Source { get; set; }
    public string? Id { get; set; }
}

// ── Insider Sentiment (from /stock/insider-sentiment) ──
public class InsiderSentimentResponse
{
    public List<InsiderSentimentData>? Data { get; set; }
    public string? Symbol { get; set; }
}

public class InsiderSentimentData
{
    public string? Symbol { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    public long Change { get; set; }
    public decimal Mspr { get; set; }
}

// ── Recommendation Trends (from /stock/recommendation) ──
public class RecommendationTrend
{
    public int StrongBuy { get; set; }
    public int Buy { get; set; }
    public int Hold { get; set; }
    public int Sell { get; set; }
    public int StrongSell { get; set; }
    public string? Period { get; set; }
    public string? Symbol { get; set; }
}
