using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.Alpaca;

public class AlpacaMarketDataClient : IAlpacaMarketDataClient
{
    private readonly HttpClient _httpClient;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaMarketDataClient> _logger;

    public AlpacaMarketDataClient(
        HttpClient httpClient,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaMarketDataClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<AlpacaBarResponse?> GetStockBarsAsync(
        IEnumerable<string> symbols,
        string timeframe,
        DateTime start,
        DateTime? end = null,
        int limit = 10000,
        string? pageToken = null,
        CancellationToken cancellationToken = default)
    {
        var symbolList = string.Join(",", symbols);
        var url = $"{_settings.MarketDataBaseUrl}/v2/stocks/bars" +
                  $"?symbols={Uri.EscapeDataString(symbolList)}" +
                  $"&timeframe={timeframe}" +
                  $"&start={start:yyyy-MM-ddTHH:mm:ssZ}" +
                  $"&limit={limit}" +
                  $"&feed={_settings.StockFeed}" +
                  $"&adjustment={_settings.StockAdjustment}" +
                  $"&sort=asc";

        if (end.HasValue)
            url += $"&end={end.Value:yyyy-MM-ddTHH:mm:ssZ}";

        if (!string.IsNullOrEmpty(pageToken))
            url += $"&page_token={Uri.EscapeDataString(pageToken)}";

        return await SendAuthenticatedRequestAsync<AlpacaBarResponse>(url, cancellationToken);
    }

    public async Task<AlpacaBarResponse?> GetCryptoBarsAsync(
        IEnumerable<string> symbols,
        string timeframe,
        DateTime start,
        DateTime? end = null,
        int limit = 10000,
        string? pageToken = null,
        CancellationToken cancellationToken = default)
    {
        var symbolList = string.Join(",", symbols);
        var url = $"{_settings.MarketDataBaseUrl}/v1beta3/crypto/{_settings.CryptoLoc}/bars" +
                  $"?symbols={Uri.EscapeDataString(symbolList)}" +
                  $"&timeframe={timeframe}" +
                  $"&start={start:yyyy-MM-ddTHH:mm:ssZ}" +
                  $"&limit={limit}" +
                  $"&sort=asc";

        if (end.HasValue)
            url += $"&end={end.Value:yyyy-MM-ddTHH:mm:ssZ}";

        if (!string.IsNullOrEmpty(pageToken))
            url += $"&page_token={Uri.EscapeDataString(pageToken)}";

        return await SendRequestAsync<AlpacaBarResponse>(url, authenticated: false, cancellationToken);
    }

    public async Task<AlpacaAssetResponse?> GetAssetAsync(
        string symbol,
        CancellationToken cancellationToken = default)
    {
        var url = $"{_settings.TradingApiBaseUrl}/v2/assets/{Uri.EscapeDataString(symbol)}";

        try
        {
            return await SendAuthenticatedRequestAsync<AlpacaAssetResponse>(url, cancellationToken);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            _logger.LogInformation("Asset not found: {Symbol}", symbol);
            return null;
        }
    }

    private async Task<T?> SendAuthenticatedRequestAsync<T>(string url, CancellationToken cancellationToken)
    {
        return await SendRequestAsync<T>(url, authenticated: true, cancellationToken);
    }

    private async Task<T?> SendRequestAsync<T>(string url, bool authenticated, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);

            if (authenticated)
            {
                request.Headers.Add("APCA-API-KEY-ID", _settings.ApiKeyId);
                request.Headers.Add("APCA-API-SECRET-KEY", _settings.ApiSecretKey);
            }

            var urlForLogging = url.Contains("?") ? url[..url.IndexOf('?')] + "?..." : url;
            _logger.LogDebug("Alpaca API Request: {Url}", urlForLogging);

            var response = await _httpClient.SendAsync(request, cancellationToken);

            await HandleRateLimitAsync(response.Headers, cancellationToken);

            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Alpaca API error {StatusCode} for {Url}: {Content}",
                    response.StatusCode, urlForLogging, content);
                response.EnsureSuccessStatusCode();
            }

            return JsonSerializer.Deserialize<T>(content);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error calling Alpaca API: {Url}", url);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Alpaca API: {Url}", url);
            throw;
        }
    }

    private async Task HandleRateLimitAsync(HttpResponseHeaders headers, CancellationToken cancellationToken)
    {
        if (headers.TryGetValues("X-RateLimit-Remaining", out var remainingValues))
        {
            var remaining = int.Parse(remainingValues.First(), CultureInfo.InvariantCulture);

            if (remaining < _settings.RateLimitThreshold)
            {
                if (headers.TryGetValues("X-RateLimit-Reset", out var resetValues))
                {
                    var resetEpoch = long.Parse(resetValues.First(), CultureInfo.InvariantCulture);
                    var resetTime = DateTimeOffset.FromUnixTimeSeconds(resetEpoch);
                    var delay = resetTime - DateTimeOffset.UtcNow;

                    if (delay > TimeSpan.Zero)
                    {
                        _logger.LogInformation(
                            "Rate limit approaching ({Remaining} remaining). Sleeping {Seconds:F1}s until reset.",
                            remaining, delay.TotalSeconds);
                        await Task.Delay(delay, cancellationToken);
                    }
                }
            }
        }
    }
}
