using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SimFin.Worker.Configuration;
using SimFin.Worker.Models;

namespace SimFin.Worker.Services;

/// <summary>
/// HTTP client for SimFin API.
/// </summary>
public class SimFinClient : ISimFinClient
{
    private readonly HttpClient _httpClient;
    private readonly SimFinSettings _settings;
    private readonly ILogger<SimFinClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public SimFinClient(
        HttpClient httpClient,
        IOptions<SimFinSettings> settings,
        ILogger<SimFinClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
        // Note: HttpClient BaseAddress and headers are configured in Program.cs via ConfigureHttpClient
        // to work properly with IHttpClientFactory lifetime management
    }

    public async Task<FundamentalsData?> GetFundamentalsAsync(string symbol, int stockTickerId, CancellationToken ct = default)
    {
        try
        {
            // Debug: Log API key presence (not the actual key for security)
            var hasApiKey = _httpClient.DefaultRequestHeaders.Contains("Authorization");
            _logger.LogInformation("Fetching fundamentals for {Symbol}. HasAuth={HasAuth}, BaseAddr={Base}", 
                symbol, hasApiKey, _httpClient.BaseAddress);

            // Build request URL for company statements
            // Fetches P&L, Balance Sheet, Cash Flow, and Derived metrics
            // Note: period=fy gives latest fiscal year data (ttm is no longer supported in API v3)
            var url = $"/companies/statements/compact?ticker={symbol}&statements=pl,bs,cf,derived&period=fy";

            var response = await _httpClient.GetAsync(url, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("SimFin API returned {StatusCode} for {Symbol}", response.StatusCode, symbol);
                return null;
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var companies = JsonSerializer.Deserialize<List<SimFinCompanyResponse>>(content, JsonOptions);

            if (companies == null || companies.Count == 0)
            {
                _logger.LogWarning("No company data returned from SimFin for {Symbol}", symbol);
                return null;
            }

            var company = companies[0];
            if (company.Statements == null || company.Statements.Count == 0)
            {
                _logger.LogWarning("No statements returned from SimFin for {Symbol}", symbol);
                return null;
            }

            // Merge all statements into a combined column/data lookup
            // Each statement has columns/data for a specific type (PL, BS, CF, DERIVED)
            var combinedData = MergeStatements(company.Statements);
            if (combinedData == null)
            {
                _logger.LogWarning("Failed to merge statements for {Symbol}", symbol);
                return null;
            }

            var (columnIndex, row) = combinedData.Value;

            var data = new FundamentalsData
            {
                StockTickerId = stockTickerId,
                LastFetchedAt = DateTime.UtcNow,
                DataSource = "simfin",

                // From DERIVED statement - profitability margins
                GrossMargin = GetDecimalValue(row, columnIndex, "Gross Profit Margin"),
                OperatingMargin = GetDecimalValue(row, columnIndex, "Operating Margin"),
                ProfitMargin = GetDecimalValue(row, columnIndex, "Net Profit Margin"),
                ReturnOnEquity = GetDecimalValue(row, columnIndex, "Return on Equity"),
                ReturnOnAssets = GetDecimalValue(row, columnIndex, "Return on Assets"),
                CurrentRatio = GetDecimalValue(row, columnIndex, "Current Ratio"),
                FreeCashFlow = GetDecimalValue(row, columnIndex, "Free Cash Flow"),
                EpsTtm = GetDecimalValue(row, columnIndex, "Earnings Per Share, Diluted"),
                PayoutRatio = GetDecimalValue(row, columnIndex, "Dividend Payout Ratio"),
                DebtToEquity = GetDecimalValue(row, columnIndex, "Liabilities to Equity Ratio"),

                // From PL (Income Statement)
                RevenueTtm = GetDecimalValue(row, columnIndex, "Revenue"),

                // From BS (Balance Sheet)
                TotalAssets = GetDecimalValue(row, columnIndex, "Total Assets"),
                TotalLiabilities = GetDecimalValue(row, columnIndex, "Total Liabilities"),
                TotalEquity = GetDecimalValue(row, columnIndex, "Total Equity"),
                SharesOutstanding = GetLongValue(row, columnIndex, "Common Shares Outstanding"),

                // Fiscal period info (from any statement)
                FiscalYear = GetIntValue(row, columnIndex, "Fiscal Year"),
                FiscalPeriod = GetStringValue(row, columnIndex, "Fiscal Period"),
                ReportDate = GetDateOnlyValue(row, columnIndex, "Report Date"),

                // These fields require price data not in statements API - will be null
                // Can be enriched from a separate price API call if needed
                MarketCap = null,
                PeRatio = null,
                PriceToBook = null,
                PriceToSales = null,
                EnterpriseValue = null,
                BookValuePerShare = GetDecimalValue(row, columnIndex, "Equity Per Share"), // Use Equity Per Share as proxy
                DividendYield = null
            };

            _logger.LogInformation(
                "Successfully fetched fundamentals for {Symbol}: FY={FY}, ROE={ROE:P2}, Margin={Margin:P2}",
                symbol, data.FiscalYear, data.ReturnOnEquity, data.ProfitMargin);

            return data;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error fetching fundamentals for {Symbol}", symbol);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching fundamentals for {Symbol}", symbol);
            throw;
        }
    }

    /// <summary>
    /// Merge all statement types into a single column/data lookup.
    /// Gets the most recent fiscal year data from each statement.
    /// </summary>
    private (Dictionary<string, int> columnIndex, List<object?> row)? MergeStatements(List<SimFinStatement> statements)
    {
        var mergedColumns = new List<string>();
        var mergedData = new List<object?>();

        foreach (var stmt in statements)
        {
            if (stmt.Columns == null || stmt.Data == null || stmt.Data.Count == 0)
                continue;

            // Get the most recent data row (last row is usually most recent fiscal year)
            var latestRow = stmt.Data[^1];

            for (int i = 0; i < stmt.Columns.Count; i++)
            {
                var colName = stmt.Columns[i];
                // Skip duplicate common columns (Fiscal Period, Fiscal Year, Report Date)
                // Keep the first occurrence
                if (!mergedColumns.Contains(colName, StringComparer.OrdinalIgnoreCase))
                {
                    mergedColumns.Add(colName);
                    mergedData.Add(i < latestRow.Count ? latestRow[i] : null);
                }
            }
        }

        if (mergedColumns.Count == 0)
            return null;

        var columnIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < mergedColumns.Count; i++)
        {
            columnIndex[mergedColumns[i]] = i;
        }

        return (columnIndex, mergedData);
    }

    private static decimal? GetDecimalValue(List<object?> row, Dictionary<string, int> columnIndex, string columnName)
    {
        if (!columnIndex.TryGetValue(columnName, out var index) || index >= row.Count)
            return null;

        var value = row[index];
        if (value == null)
            return null;

        return value switch
        {
            JsonElement je when je.ValueKind == JsonValueKind.Number => je.GetDecimal(),
            JsonElement je when je.ValueKind == JsonValueKind.String && decimal.TryParse(je.GetString(), out var d) => d,
            decimal d => d,
            double dd => (decimal)dd,
            float f => (decimal)f,
            long l => l,
            int i => i,
            string s when decimal.TryParse(s, out var d) => d,
            _ => null
        };
    }

    private static long? GetLongValue(List<object?> row, Dictionary<string, int> columnIndex, string columnName)
    {
        if (!columnIndex.TryGetValue(columnName, out var index) || index >= row.Count)
            return null;

        var value = row[index];
        if (value == null)
            return null;

        return value switch
        {
            JsonElement je when je.ValueKind == JsonValueKind.Number => je.GetInt64(),
            JsonElement je when je.ValueKind == JsonValueKind.String && long.TryParse(je.GetString(), out var l) => l,
            long l => l,
            int i => i,
            decimal d => (long)d,
            double dd => (long)dd,
            string s when long.TryParse(s, out var l) => l,
            _ => null
        };
    }

    private static int? GetIntValue(List<object?> row, Dictionary<string, int> columnIndex, string columnName)
    {
        if (!columnIndex.TryGetValue(columnName, out var index) || index >= row.Count)
            return null;

        var value = row[index];
        if (value == null)
            return null;

        return value switch
        {
            JsonElement je when je.ValueKind == JsonValueKind.Number => je.GetInt32(),
            JsonElement je when je.ValueKind == JsonValueKind.String && int.TryParse(je.GetString(), out var i) => i,
            int i => i,
            long l => (int)l,
            decimal d => (int)d,
            double dd => (int)dd,
            string s when int.TryParse(s, out var i) => i,
            _ => null
        };
    }

    private static string? GetStringValue(List<object?> row, Dictionary<string, int> columnIndex, string columnName)
    {
        if (!columnIndex.TryGetValue(columnName, out var index) || index >= row.Count)
            return null;

        var value = row[index];
        if (value == null)
            return null;

        return value switch
        {
            JsonElement je when je.ValueKind == JsonValueKind.String => je.GetString(),
            string s => s,
            _ => value?.ToString() ?? string.Empty
        };
    }

    private static DateOnly? GetDateOnlyValue(List<object?> row, Dictionary<string, int> columnIndex, string columnName)
    {
        if (!columnIndex.TryGetValue(columnName, out var index) || index >= row.Count)
            return null;

        var value = row[index];
        if (value == null)
            return null;

        string? dateStr = value switch
        {
            JsonElement je when je.ValueKind == JsonValueKind.String => je.GetString(),
            string s => s,
            _ => null
        };

        if (dateStr != null && DateOnly.TryParse(dateStr, out var date))
            return date;

        return null;
    }
}

/// <summary>
/// SimFin API response model for compact statements endpoint.
/// Response structure: [{name, ticker, statements: [{statement, columns, data}]}]
/// </summary>
internal class SimFinCompanyResponse
{
    public string Name { get; set; } = string.Empty;
    public string Ticker { get; set; } = string.Empty;
    public int Id { get; set; }
    public string Currency { get; set; } = string.Empty;
    public List<SimFinStatement> Statements { get; set; } = new();
}

internal class SimFinStatement
{
    public string Statement { get; set; } = string.Empty; // PL, BS, CF, DERIVED
    public List<string> Columns { get; set; } = new();
    public List<List<object?>> Data { get; set; } = new();
}
