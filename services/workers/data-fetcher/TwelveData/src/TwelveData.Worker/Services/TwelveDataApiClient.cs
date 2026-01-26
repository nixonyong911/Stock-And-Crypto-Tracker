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

    public async Task<TimeSeriesResponse?> GetHistoricalTimeSeriesAsync(
        string symbol, 
        string interval,
        int outputSize, 
        string exchange = "NASDAQ",
        string? endDate = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = BuildHistoricalTimeSeriesUrl(symbol, interval, outputSize, exchange, endDate);
            var urlForLogging = BuildHistoricalTimeSeriesUrlForLogging(symbol, interval, outputSize, exchange, endDate);
            
            _logger.LogInformation("TwelveData Historical API Request: {Symbol} - {Url}", symbol, urlForLogging);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            // Log raw response for debugging
            _logger.LogDebug("TwelveData Historical API Response for {Symbol}: {Response}", symbol, 
                content.Length > 500 ? content.Substring(0, 500) + "..." : content);
            
            response.EnsureSuccessStatusCode();
            
            var timeSeriesResponse = JsonSerializer.Deserialize<TimeSeriesResponse>(content);
            
            if (timeSeriesResponse == null)
            {
                _logger.LogWarning("Failed to deserialize historical response for {Symbol}. Raw: {Response}", symbol, content);
                return null;
            }
            
            // Check for API error responses
            if (timeSeriesResponse.Status == "error")
            {
                _logger.LogWarning("TwelveData Historical API error for {Symbol}: {Message} (Code: {Code}). Request: {Url}", 
                    symbol, timeSeriesResponse.Message, timeSeriesResponse.Code, urlForLogging);
                return null;
            }

            _logger.LogInformation("TwelveData Historical API Success: {Symbol} - {Count} data points fetched (endDate: {EndDate})", 
                symbol, timeSeriesResponse.Values?.Count ?? 0, endDate ?? "none");
            
            return timeSeriesResponse;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error fetching historical time series for {Symbol}. Status: {Status}", 
                symbol, ex.StatusCode);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching historical time series for {Symbol}", symbol);
            throw;
        }
    }

    private string BuildHistoricalTimeSeriesUrl(string symbol, string interval, int outputSize, string exchange, string? endDate)
    {
        var url = $"/time_series?symbol={symbol}" +
                  $"&interval={interval}" +
                  $"&exchange={exchange}" +
                  $"&timezone=America/New_York" +
                  $"&outputsize={outputSize}" +
                  $"&apikey={_settings.ApiKey}";
        
        // Add end_date only for batching (subsequent requests after first batch)
        if (!string.IsNullOrEmpty(endDate))
        {
            url += $"&end_date={endDate}";
        }
        
        return url;
    }

    private string BuildHistoricalTimeSeriesUrlForLogging(string symbol, string interval, int outputSize, string exchange, string? endDate)
    {
        var url = $"/time_series?symbol={symbol}" +
                  $"&interval={interval}" +
                  $"&exchange={exchange}" +
                  $"&timezone=America/New_York" +
                  $"&outputsize={outputSize}" +
                  $"&apikey=***REDACTED***";
        
        if (!string.IsNullOrEmpty(endDate))
        {
            url += $"&end_date={endDate}";
        }
        
        return url;
    }

    /// <summary>
    /// Calculates the end_date for the next batch based on the oldest datetime from previous batch
    /// </summary>
    /// <param name="oldestDatetime">Oldest datetime from previous batch (format: "yyyy-MM-dd HH:mm:ss")</param>
    /// <param name="intervalMinutes">Interval in minutes</param>
    /// <returns>End date formatted for TwelveData API (format: "yyyy-MM-ddTHH:mm:ss")</returns>
    public static string CalculateNextBatchEndDate(string oldestDatetime, int intervalMinutes)
    {
        var parsed = DateTime.ParseExact(
            oldestDatetime, 
            "yyyy-MM-dd HH:mm:ss", 
            CultureInfo.InvariantCulture,
            DateTimeStyles.None);
        
        var nextEndDate = parsed.AddMinutes(-intervalMinutes);
        
        // Format with T separator for TwelveData API
        return nextEndDate.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
    }

    public async Task<TimeSeriesResponse?> GetCryptoTimeSeriesAsync(
        string symbol, 
        CryptoFetchConfig config, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = BuildCryptoTimeSeriesUrl(symbol, config);
            var urlForLogging = BuildCryptoTimeSeriesUrlForLogging(symbol, config);
            
            _logger.LogInformation("TwelveData Crypto API Request: {Symbol} - {Url}", symbol, urlForLogging);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            // Log raw response for debugging
            _logger.LogDebug("TwelveData Crypto API Response for {Symbol}: {Response}", symbol, 
                content.Length > 500 ? content.Substring(0, 500) + "..." : content);
            
            response.EnsureSuccessStatusCode();
            
            var timeSeriesResponse = JsonSerializer.Deserialize<TimeSeriesResponse>(content);
            
            if (timeSeriesResponse == null)
            {
                _logger.LogWarning("Failed to deserialize crypto response for {Symbol}. Raw: {Response}", symbol, content);
                return null;
            }
            
            // Check for API error responses
            if (timeSeriesResponse.Status == "error")
            {
                _logger.LogWarning("TwelveData Crypto API error for {Symbol}: {Message} (Code: {Code}). Request: {Url}", 
                    symbol, timeSeriesResponse.Message, timeSeriesResponse.Code, urlForLogging);
                return null;
            }

            _logger.LogInformation("TwelveData Crypto API Success: {Symbol} - {Count} data points fetched", 
                symbol, timeSeriesResponse.Values?.Count ?? 0);
            
            return timeSeriesResponse;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error fetching crypto time series for {Symbol}. Status: {Status}", 
                symbol, ex.StatusCode);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching crypto time series for {Symbol}", symbol);
            throw;
        }
    }

    private string BuildCryptoTimeSeriesUrl(string symbol, CryptoFetchConfig config)
    {
        // Resolve "yesterday" to actual date for TwelveData API
        var resolvedDate = ResolveFetchDate(config.FetchDate);
        
        // Note: Crypto doesn't use exchange parameter - TwelveData aggregates across exchanges
        return $"/time_series?symbol={Uri.EscapeDataString(symbol)}" +
               $"&interval={config.Interval}" +
               $"&date={resolvedDate}" +
               $"&timezone={config.Timezone}" +
               $"&outputsize={config.OutputSize}" +
               $"&apikey={_settings.ApiKey}";
    }

    private string BuildCryptoTimeSeriesUrlForLogging(string symbol, CryptoFetchConfig config)
    {
        var resolvedDate = ResolveFetchDate(config.FetchDate);
        
        return $"/time_series?symbol={Uri.EscapeDataString(symbol)}" +
               $"&interval={config.Interval}" +
               $"&date={resolvedDate}" +
               $"&timezone={config.Timezone}" +
               $"&outputsize={config.OutputSize}" +
               $"&apikey=***REDACTED***";
    }

    /// <summary>
    /// Converts a UTC datetime string to UTC DateTime object.
    /// Used for crypto data which is returned in UTC timezone.
    /// </summary>
    /// <param name="datetime">Datetime string in format "yyyy-MM-dd HH:mm:ss"</param>
    /// <returns>UTC DateTime</returns>
    public static DateTime ConvertUtcString(string datetime)
    {
        var utcDateTime = DateTime.ParseExact(
            datetime, 
            "yyyy-MM-dd HH:mm:ss", 
            CultureInfo.InvariantCulture,
            DateTimeStyles.None);
        
        return DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
    }
}
