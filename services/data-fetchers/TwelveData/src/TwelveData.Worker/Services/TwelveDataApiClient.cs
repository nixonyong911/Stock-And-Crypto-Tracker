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

    public async Task<TimeSeriesResponse?> GetTimeSeriesAsync(string symbol, CancellationToken cancellationToken = default)
    {
        try
        {
            var url = BuildTimeSeriesUrl(symbol);
            
            _logger.LogDebug("Fetching time series for {Symbol} from {Url}", symbol, url);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            var timeSeriesResponse = JsonSerializer.Deserialize<TimeSeriesResponse>(content);
            
            if (timeSeriesResponse == null)
            {
                _logger.LogWarning("Failed to deserialize response for {Symbol}", symbol);
                return null;
            }
            
            // Check for API error responses
            if (timeSeriesResponse.Status == "error")
            {
                _logger.LogWarning("API error for {Symbol}: {Message} (Code: {Code})", 
                    symbol, timeSeriesResponse.Message, timeSeriesResponse.Code);
                return null;
            }

            _logger.LogDebug("Fetched {Count} data points for {Symbol}", 
                timeSeriesResponse.Values?.Count ?? 0, symbol);
            
            return timeSeriesResponse;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching time series for {Symbol}", symbol);
            throw;
        }
    }

    private string BuildTimeSeriesUrl(string symbol)
    {
        return $"/time_series?symbol={symbol}" +
               $"&interval={_settings.Interval}" +
               $"&exchange={_settings.Exchange}" +
               $"&timezone={_settings.Timezone}" +
               $"&outputsize={_settings.OutputSize}" +
               $"&apikey={_settings.ApiKey}";
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

