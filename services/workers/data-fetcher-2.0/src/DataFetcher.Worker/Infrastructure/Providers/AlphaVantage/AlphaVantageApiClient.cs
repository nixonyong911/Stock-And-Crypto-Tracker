using System.Globalization;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage.Models;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.AlphaVantage;

/// <summary>
/// HTTP client implementation for Alpha Vantage API.
/// </summary>
public class AlphaVantageApiClient : IAlphaVantageApiClient
{
    private readonly HttpClient _httpClient;
    private readonly AlphaVantageSettings _settings;
    private readonly ILogger<AlphaVantageApiClient> _logger;

    public AlphaVantageApiClient(
        HttpClient httpClient,
        IOptions<AlphaVantageSettings> settings,
        ILogger<AlphaVantageApiClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;

        _httpClient.BaseAddress = new Uri(_settings.BaseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    /// <inheritdoc />
    public async Task<IEnumerable<EarningsCalendarItem>> GetEarningsCalendarAsync(
        string symbol,
        CancellationToken cancellationToken = default)
    {
        var url = $"/query?function=EARNINGS_CALENDAR&symbol={symbol}&horizon={_settings.Horizon}&apikey={_settings.ApiKey}";

        _logger.LogDebug("Fetching earnings calendar for {Symbol} with horizon {Horizon}", symbol, _settings.Horizon);

        try
        {
            var response = await _httpClient.GetStringAsync(url, cancellationToken);
            return ParseCsvResponse(response, symbol);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error fetching earnings calendar for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<IEnumerable<EarningsCalendarItem>> GetAllEarningsCalendarAsync(
        CancellationToken cancellationToken = default)
    {
        var url = $"/query?function=EARNINGS_CALENDAR&horizon={_settings.Horizon}&apikey={_settings.ApiKey}";

        _logger.LogDebug("Fetching all earnings calendar with horizon {Horizon}", _settings.Horizon);

        try
        {
            var response = await _httpClient.GetStringAsync(url, cancellationToken);
            return ParseCsvResponse(response, null);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error fetching all earnings calendar");
            throw;
        }
    }

    /// <summary>
    /// Parses CSV response from Alpha Vantage.
    /// Format: symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay
    /// </summary>
    private IEnumerable<EarningsCalendarItem> ParseCsvResponse(string csvContent, string? expectedSymbol)
    {
        var items = new List<EarningsCalendarItem>();

        if (string.IsNullOrWhiteSpace(csvContent))
        {
            _logger.LogWarning("Empty CSV response from Alpha Vantage");
            return items;
        }

        var lines = csvContent.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        // Skip header row
        if (lines.Length <= 1)
        {
            _logger.LogDebug("No data rows in CSV response (only header)");
            return items;
        }

        // Check for error response (Alpha Vantage returns "Information" or "Error" messages in CSV format)
        if (lines[0].StartsWith("Information") || lines[0].StartsWith("Error") || 
            lines[0].Contains("Invalid API call") || lines[0].Contains("API rate limit"))
        {
            _logger.LogWarning("Alpha Vantage API error response: {Response}", lines[0]);
            return items;
        }

        // Validate header
        var header = lines[0].ToLowerInvariant();
        if (!header.Contains("symbol") || !header.Contains("reportdate"))
        {
            _logger.LogWarning("Unexpected CSV header format: {Header}", lines[0]);
            return items;
        }

        // Parse data rows
        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                var item = ParseCsvLine(line);
                if (item != null)
                {
                    // If expectedSymbol is provided, filter to only that symbol
                    if (expectedSymbol == null || 
                        item.Symbol.Equals(expectedSymbol, StringComparison.OrdinalIgnoreCase))
                    {
                        items.Add(item);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse CSV line {LineNumber}: {Line}", i, line);
            }
        }

        _logger.LogDebug("Parsed {Count} earnings calendar items", items.Count);
        return items;
    }

    /// <summary>
    /// Parses a single CSV line into an EarningsCalendarItem.
    /// </summary>
    private EarningsCalendarItem? ParseCsvLine(string line)
    {
        // Handle CSV with potential quoted fields
        var fields = ParseCsvFields(line);

        if (fields.Length < 5)
        {
            _logger.LogDebug("Skipping line with insufficient fields: {FieldCount}", fields.Length);
            return null;
        }

        var symbol = fields[0].Trim();
        var name = fields[1].Trim();
        var reportDateStr = fields[2].Trim();
        var fiscalDateEndingStr = fields[3].Trim();
        var estimateStr = fields[4].Trim();
        var currency = fields.Length > 5 ? fields[5].Trim() : "USD";
        var timeOfDay = fields.Length > 6 ? fields[6].Trim() : "";

        if (string.IsNullOrEmpty(symbol) || string.IsNullOrEmpty(reportDateStr))
        {
            return null;
        }

        if (!DateOnly.TryParse(reportDateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var reportDate))
        {
            _logger.LogDebug("Could not parse reportDate: {Date}", reportDateStr);
            return null;
        }

        DateOnly fiscalDateEnding = reportDate;
        if (!string.IsNullOrEmpty(fiscalDateEndingStr))
        {
            DateOnly.TryParse(fiscalDateEndingStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out fiscalDateEnding);
        }

        decimal? estimate = null;
        if (!string.IsNullOrEmpty(estimateStr) && 
            decimal.TryParse(estimateStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsedEstimate))
        {
            estimate = parsedEstimate;
        }

        return new EarningsCalendarItem
        {
            Symbol = symbol,
            Name = name,
            ReportDate = reportDate,
            FiscalDateEnding = fiscalDateEnding,
            Estimate = estimate,
            Currency = currency,
            TimeOfTheDay = timeOfDay
        };
    }

    /// <summary>
    /// Parses CSV fields, handling quoted values.
    /// </summary>
    private static string[] ParseCsvFields(string line)
    {
        var fields = new List<string>();
        var currentField = new System.Text.StringBuilder();
        var inQuotes = false;

        foreach (var c in line)
        {
            if (c == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            {
                fields.Add(currentField.ToString());
                currentField.Clear();
            }
            else
            {
                currentField.Append(c);
            }
        }

        fields.Add(currentField.ToString());
        return fields.ToArray();
    }
}
