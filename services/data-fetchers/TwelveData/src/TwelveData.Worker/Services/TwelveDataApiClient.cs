using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public class TwelveDataApiClient : ITwelveDataApiClient
{
    private readonly HttpClient _httpClient;
    private readonly TwelveDataSettings _settings;
    private readonly ILogger<TwelveDataApiClient> _logger;
    private static readonly TimeZoneInfo EasternTimeZone;

    static TwelveDataApiClient()
    {
        // Handle both Windows and Linux timezone identifiers
        try
        {
            EasternTimeZone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        }
        catch (TimeZoneNotFoundException)
        {
            // Fallback for Windows
            EasternTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
        }
    }

    public TwelveDataApiClient(
        HttpClient httpClient,
        IOptions<TwelveDataSettings> settings,
        ILogger<TwelveDataApiClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
        
        _httpClient.BaseAddress = new Uri(_settings.BaseUrl);
    }

    public async Task<TimeSeriesResponse?> GetTimeSeriesAsync(string symbol, FetchConfig config, CancellationToken cancellationToken = default)
    {
        try
        {
            var url = BuildTimeSeriesUrl(symbol, config);
            var urlForLogging = BuildTimeSeriesUrlForLogging(symbol, config);
            
            _logger.LogInformation("TwelveData API Request: {Symbol} - {Url}", symbol, urlForLogging);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            // Log raw response for debugging
            _logger.LogDebug("TwelveData API Response for {Symbol}: {Response}", symbol, 
                content.Length > 500 ? content.Substring(0, 500) + "..." : content);
            
            response.EnsureSuccessStatusCode();
            
            var timeSeriesResponse = JsonSerializer.Deserialize<TimeSeriesResponse>(content);
            
            if (timeSeriesResponse == null)
            {
                _logger.LogWarning("Failed to deserialize response for {Symbol}. Raw: {Response}", symbol, content);
                return null;
            }
            
            // Check for API error responses
            if (timeSeriesResponse.Status == "error")
            {
                _logger.LogWarning("TwelveData API error for {Symbol}: {Message} (Code: {Code}). Request: {Url}", 
                    symbol, timeSeriesResponse.Message, timeSeriesResponse.Code, urlForLogging);
                return null;
            }

            _logger.LogInformation("TwelveData API Success: {Symbol} - {Count} data points fetched", 
                symbol, timeSeriesResponse.Values?.Count ?? 0);
            
            return timeSeriesResponse;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error fetching time series for {Symbol}. Status: {Status}", 
                symbol, ex.StatusCode);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching time series for {Symbol}", symbol);
            throw;
        }
    }

    private string BuildTimeSeriesUrl(string symbol, FetchConfig config)
    {
        // Resolve "yesterday" to actual date for TwelveData API
        var resolvedDate = ResolveFetchDate(config.FetchDate);
        
        return $"/time_series?symbol={symbol}" +
               $"&interval={config.Interval}" +
               $"&exchange={config.Exchange}" +
               $"&date={resolvedDate}" +
               $"&timezone={config.Timezone}" +
               $"&outputsize={config.OutputSize}" +
               $"&apikey={_settings.ApiKey}";
    }

    private string BuildTimeSeriesUrlForLogging(string symbol, FetchConfig config)
    {
        var resolvedDate = ResolveFetchDate(config.FetchDate);
        
        return $"/time_series?symbol={symbol}" +
               $"&interval={config.Interval}" +
               $"&exchange={config.Exchange}" +
               $"&date={resolvedDate}" +
               $"&timezone={config.Timezone}" +
               $"&outputsize={config.OutputSize}" +
               $"&apikey=***REDACTED***";
    }

    /// <summary>
    /// Resolves fetch date - converts "yesterday", "today" to actual YYYY-MM-DD format
    /// TwelveData accepts both formats, but explicit dates are more reliable
    /// </summary>
    private static string ResolveFetchDate(string fetchDate)
    {
        var lowerDate = fetchDate.ToLowerInvariant().Trim();
        
        return lowerDate switch
        {
            "yesterday" => DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd"),
            "today" => DateTime.UtcNow.ToString("yyyy-MM-dd"),
            _ => fetchDate // Already in YYYY-MM-DD format
        };
    }

    /// <summary>
    /// Converts a datetime string from America/New_York timezone to UTC
    /// </summary>
    /// <param name="datetime">Datetime string in format "yyyy-MM-dd HH:mm:ss"</param>
    /// <returns>UTC DateTime</returns>
    public static DateTime ConvertToUtc(string datetime)
    {
        var localDateTime = DateTime.ParseExact(
            datetime, 
            "yyyy-MM-dd HH:mm:ss", 
            CultureInfo.InvariantCulture,
            DateTimeStyles.None);
        
        return TimeZoneInfo.ConvertTimeToUtc(localDateTime, EasternTimeZone);
    }

    /// <summary>
    /// Parses a decimal value from a string, returning 0 if parsing fails
    /// </summary>
    public static decimal ParseDecimal(string value)
    {
        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) 
            ? result 
            : 0;
    }

    /// <summary>
    /// Parses a long value from a string, returning 0 if parsing fails
    /// </summary>
    public static long ParseLong(string value)
    {
        return long.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) 
            ? result 
            : 0;
    }
}
