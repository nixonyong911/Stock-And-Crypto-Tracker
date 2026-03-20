using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Configuration.Providers;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub;

/// <summary>
/// Client implementation for interacting with the Finnhub API.
/// </summary>
public class FinnhubApiClient : IFinnhubApiClient, IDataProviderContract
{
    private readonly HttpClient _httpClient;
    private readonly FinnhubSettings _settings;
    private readonly ILogger<FinnhubApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions;
    private DateTime _lastCallTime = DateTime.MinValue;

    public string ProviderName => "Finnhub";

    public ProviderCapabilities Capabilities => new()
    {
        Stocks = true,
        Crypto = false,
        Etfs = false,
        Commodities = false,
        Indices = false,
        SupportsBatchFetch = false
    };

    public ResilienceConfig GetResilienceConfig() => new(
        MaxRetries: 2,
        InitialRetryDelay: TimeSpan.FromSeconds(2),
        RequestTimeout: TimeSpan.FromSeconds(30),
        CircuitBreakerThreshold: 5,
        CircuitBreakerDuration: TimeSpan.FromMinutes(2)
    );

    public async Task<HealthCheckResult> HealthCheckAsync(CancellationToken ct)
    {
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var profile = await GetCompanyProfileAsync("AAPL", ct);
            return new HealthCheckResult(profile != null, Latency: sw.Elapsed);
        }
        catch (Exception ex)
        {
            return new HealthCheckResult(false, ex.Message);
        }
    }

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

    /// <inheritdoc />
    public async Task<List<StockEarning>?> GetStockEarningsAsync(string symbol, CancellationToken cancellationToken = default)
    {
        await RateLimitAsync(cancellationToken);

        try
        {
            var url = $"stock/earnings?symbol={symbol}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching stock earnings for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content) || content == "[]")
            {
                _logger.LogWarning("Empty response for stock earnings for {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<List<StockEarning>>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching stock earnings for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<InsiderTransactionsResponse?> GetInsiderTransactionsAsync(string symbol, CancellationToken ct = default)
    {
        await RateLimitAsync(ct);

        try
        {
            var url = $"stock/insider-transactions?symbol={symbol}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching insider transactions for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(ct);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for insider transactions {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<InsiderTransactionsResponse>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching insider transactions for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<InsiderSentimentResponse?> GetInsiderSentimentAsync(string symbol, string from, string to, CancellationToken ct = default)
    {
        await RateLimitAsync(ct);

        try
        {
            var url = $"stock/insider-sentiment?symbol={symbol}&from={from}&to={to}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching insider sentiment for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(ct);
            if (string.IsNullOrWhiteSpace(content) || content == "{}")
            {
                _logger.LogWarning("Empty response for insider sentiment {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<InsiderSentimentResponse>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching insider sentiment for {Symbol}", symbol);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<List<RecommendationTrend>?> GetRecommendationTrendsAsync(string symbol, CancellationToken ct = default)
    {
        await RateLimitAsync(ct);

        try
        {
            var url = $"stock/recommendation?symbol={symbol}&token={_settings.ApiKey}";
            _logger.LogDebug("Fetching recommendation trends for {Symbol}", symbol);

            var response = await _httpClient.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(ct);
            if (string.IsNullOrWhiteSpace(content) || content == "[]")
            {
                _logger.LogWarning("Empty response for recommendation trends {Symbol}", symbol);
                return null;
            }

            return JsonSerializer.Deserialize<List<RecommendationTrend>>(content, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching recommendation trends for {Symbol}", symbol);
            throw;
        }
    }
}
