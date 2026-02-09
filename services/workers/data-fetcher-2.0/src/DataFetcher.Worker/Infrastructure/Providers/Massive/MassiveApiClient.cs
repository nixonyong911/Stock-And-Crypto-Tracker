using System.Text.Json;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Models;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive;

/// <summary>
/// HTTP client implementation for interacting with the Massive technical indicators API.
/// This client makes raw HTTP calls without rate limiting; rate limiting is centralized
/// in the RabbitMQ queue consumer.
/// </summary>
public class MassiveApiClient : IMassiveApiClient
{
    private readonly HttpClient _httpClient;
    private readonly MassiveSettings _settings;
    private readonly ILogger<MassiveApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions;

    /// <summary>
    /// Initializes a new instance of the <see cref="MassiveApiClient"/> class.
    /// </summary>
    /// <param name="httpClient">The HTTP client instance.</param>
    /// <param name="settings">The Massive API configuration settings.</param>
    /// <param name="logger">The logger instance.</param>
    public MassiveApiClient(
        HttpClient httpClient,
        IOptions<MassiveSettings> settings,
        ILogger<MassiveApiClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;

        // Ensure base URL ends with / for proper relative URL resolution
        var baseUrl = _settings.BaseUrl.TrimEnd('/') + "/";
        _httpClient.BaseAddress = new Uri(baseUrl);

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
        };
    }

    /// <inheritdoc />
    public async Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetSmaAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"indicators/sma/{symbol}?timespan={_settings.Timespan}&window={window}&series_type=close&adjusted=true&order=asc&limit={limit}&timestamp.gte={timestampGte}&timestamp.lte={timestampLte}&apiKey={_settings.ApiKey}";
            _logger.LogDebug("Fetching SMA for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for SMA {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<MassiveIndicatorResponse<MassiveIndicatorValue>>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching SMA for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetEmaAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"indicators/ema/{symbol}?timespan={_settings.Timespan}&window={window}&series_type=close&adjusted=true&order=asc&limit={limit}&timestamp.gte={timestampGte}&timestamp.lte={timestampLte}&apiKey={_settings.ApiKey}";
            _logger.LogDebug("Fetching EMA for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for EMA {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<MassiveIndicatorResponse<MassiveIndicatorValue>>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching EMA for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<MassiveIndicatorResponse<MassiveMacdValue>?> GetMacdAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int shortWindow,
        int longWindow,
        int signalWindow,
        int limit,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"indicators/macd/{symbol}?timespan={_settings.Timespan}&short_window={shortWindow}&long_window={longWindow}&signal_window={signalWindow}&series_type=close&adjusted=true&order=asc&limit={limit}&timestamp.gte={timestampGte}&timestamp.lte={timestampLte}&apiKey={_settings.ApiKey}";
            _logger.LogDebug("Fetching MACD for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for MACD {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<MassiveIndicatorResponse<MassiveMacdValue>>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching MACD for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetRsiAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"indicators/rsi/{symbol}?timespan={_settings.Timespan}&window={window}&series_type=close&adjusted=true&order=asc&limit={limit}&timestamp.gte={timestampGte}&timestamp.lte={timestampLte}&apiKey={_settings.ApiKey}";
            _logger.LogDebug("Fetching RSI for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for RSI {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<MassiveIndicatorResponse<MassiveIndicatorValue>>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching RSI for {Symbol}", symbol);
            throw;
        }
    }
}
