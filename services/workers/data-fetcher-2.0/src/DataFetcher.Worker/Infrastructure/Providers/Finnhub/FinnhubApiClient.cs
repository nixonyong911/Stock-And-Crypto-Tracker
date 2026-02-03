using System.Text.Json;
using DataFetcher.Worker.Configuration.Providers;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub;

/// <summary>
/// Client implementation for interacting with the Finnhub API.
/// </summary>
public class FinnhubApiClient : IFinnhubApiClient
{
    private readonly HttpClient _httpClient;
    private readonly FinnhubSettings _settings;
    private readonly ILogger<FinnhubApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions;
    private DateTime _lastCallTime = DateTime.MinValue;

    public FinnhubApiClient(
        HttpClient httpClient,
        IOptions<FinnhubSettings> settings,
        ILogger<FinnhubApiClient> logger)
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
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
    }

    private async Task RateLimitAsync(CancellationToken cancellationToken)
    {
        var elapsed = DateTime.UtcNow - _lastCallTime;
        var delay = TimeSpan.FromMilliseconds(_settings.RateLimitDelayMs) - elapsed;

        if (delay > TimeSpan.Zero)
        {
            _logger.LogDebug("Rate limiting: waiting {Delay}ms", delay.TotalMilliseconds);
            await Task.Delay(delay, cancellationToken);
        }

        _lastCallTime = DateTime.UtcNow;
    }

    /// <inheritdoc />
    public async Task<CompanyProfile?> GetCompanyProfileAsync(string symbol, CancellationToken cancellationToken = default)
    {
        await RateLimitAsync(cancellationToken);

        try
        {
            var url = $"stock/profile2?symbol={symbol}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching company profile for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for company profile {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<CompanyProfile>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching company profile for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<BasicFinancials?> GetBasicFinancialsAsync(string symbol, CancellationToken cancellationToken = default)
    {
        await RateLimitAsync(cancellationToken);

        try
        {
            var url = $"stock/metric?symbol={symbol}&metric=all&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching basic financials for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for basic financials {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<BasicFinancials>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching basic financials for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<FinancialsReported?> GetFinancialsReportedAsync(string symbol, string freq = "quarterly", CancellationToken cancellationToken = default)
    {
        await RateLimitAsync(cancellationToken);

        try
        {
            var url = $"stock/financials-reported?symbol={symbol}&freq={freq}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching financials reported for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for financials reported {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<FinancialsReported>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching financials reported for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<EarningsCalendar?> GetEarningsCalendarAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await RateLimitAsync(cancellationToken);

        try
        {
            var url = $"calendar/earnings?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching earnings calendar from {From} to {To}", from, to);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for earnings calendar");
                return null;
            }

            return JsonSerializer.Deserialize<EarningsCalendar>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching earnings calendar");
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<EarningsCalendar?> GetEarningsCalendarBySymbolAsync(string symbol, CancellationToken cancellationToken = default)
    {
        await RateLimitAsync(cancellationToken);

        try
        {
            var url = $"calendar/earnings?symbol={symbol}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching earnings calendar for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for earnings calendar for {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<EarningsCalendar>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching earnings calendar for {Symbol}", symbol);
            throw;
        }
    }
}
