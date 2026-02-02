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

    // Column name to index mapping for SimFin response
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
            _logger.LogDebug("Fetching fundamentals for {Symbol} from SimFin", symbol);

            // Build request URL for company statements
            // Fetches P&L, Balance Sheet, Cash Flow, and Derived metrics
            var url = $"/companies/statements/compact?ticker={symbol}&statements=pl,bs,cf,derived&period=ttm&fyear=0";

            var response = await _httpClient.GetAsync(url, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("SimFin API returned {StatusCode} for {Symbol}", response.StatusCode, symbol);
                return null;
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var simFinResponse = JsonSerializer.Deserialize<SimFinResponse>(content, JsonOptions);

            if (simFinResponse?.Columns == null || simFinResponse.Data == null || simFinResponse.Data.Count == 0)
            {
                _logger.LogWarning("No data returned from SimFin for {Symbol}", symbol);
                return null;
            }

            // Create column index lookup
            var columnIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < simFinResponse.Columns.Count; i++)
            {
                columnIndex[simFinResponse.Columns[i]] = i;
            }

            // Get the first row of data (most recent)
            var row = simFinResponse.Data[0];

            var data = new FundamentalsData
            {
                StockTickerId = stockTickerId,
                LastFetchedAt = DateTime.UtcNow,
                DataSource = "simfin",

                // Valuation Metrics (from derived)
                MarketCap = GetDecimalValue(row, columnIndex, "Market Capitalisation"),
                PeRatio = GetDecimalValue(row, columnIndex, "Price to Earnings Ratio (ttm)"),
                PriceToBook = GetDecimalValue(row, columnIndex, "Price to Book Value"),
                PriceToSales = GetDecimalValue(row, columnIndex, "Price to Sales Ratio (ttm)"),
                EnterpriseValue = GetDecimalValue(row, columnIndex, "Enterprise Value"),
                EpsTtm = GetDecimalValue(row, columnIndex, "Earnings Per Share, Diluted"),

                // Profitability Margins (from derived)
                GrossMargin = GetDecimalValue(row, columnIndex, "Gross Profit Margin"),
                OperatingMargin = GetDecimalValue(row, columnIndex, "Operating Margin"),
                ProfitMargin = GetDecimalValue(row, columnIndex, "Net Profit Margin"),
                ReturnOnEquity = GetDecimalValue(row, columnIndex, "Return on Equity"),
                ReturnOnAssets = GetDecimalValue(row, columnIndex, "Return on Assets"),

                // Balance Sheet metrics
                TotalAssets = GetDecimalValue(row, columnIndex, "Total Assets"),
                TotalLiabilities = GetDecimalValue(row, columnIndex, "Total Liabilities"),
                TotalEquity = GetDecimalValue(row, columnIndex, "Total Equity"),
                CurrentRatio = GetDecimalValue(row, columnIndex, "Current Ratio"),
                DebtToEquity = GetDecimalValue(row, columnIndex, "Total Debt / Total Equity"),

                // Other metrics
                BookValuePerShare = GetDecimalValue(row, columnIndex, "Book Value per Share"),
                DividendYield = GetDecimalValue(row, columnIndex, "Dividend Yield"),
                PayoutRatio = GetDecimalValue(row, columnIndex, "Payout Ratio"),
                RevenueTtm = GetDecimalValue(row, columnIndex, "Revenue"),
                FreeCashFlow = GetDecimalValue(row, columnIndex, "Free Cash Flow"),

                // Shares outstanding (as long)
                SharesOutstanding = GetLongValue(row, columnIndex, "Common Shares Outstanding"),

                // Fiscal period info
                FiscalYear = GetIntValue(row, columnIndex, "Fiscal Year"),
                FiscalPeriod = GetStringValue(row, columnIndex, "Fiscal Period"),
                ReportDate = GetDateOnlyValue(row, columnIndex, "Report Date")
            };

            _logger.LogInformation(
                "Successfully fetched fundamentals for {Symbol}: MarketCap={MarketCap:N0}, PE={PE:N2}, ROE={ROE:P2}",
                symbol, data.MarketCap, data.PeRatio, data.ReturnOnEquity);

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
/// </summary>
internal class SimFinResponse
{
    public List<string> Columns { get; set; } = new();
    public List<List<object?>> Data { get; set; } = new();
}
