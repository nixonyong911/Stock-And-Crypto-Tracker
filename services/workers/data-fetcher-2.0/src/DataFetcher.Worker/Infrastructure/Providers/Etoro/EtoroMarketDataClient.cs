using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.Etoro;

public class EtoroMarketDataClient : IEtoroMarketDataClient
{
    private readonly HttpClient _httpClient;
    private readonly EtoroSettings _settings;
    private readonly ILogger<EtoroMarketDataClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public EtoroMarketDataClient(
        HttpClient httpClient,
        IOptions<EtoroSettings> settings,
        ILogger<EtoroMarketDataClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<List<EtoroInstrument>> SearchInstrumentAsync(
        string value,
        string filterField = "internalSymbolFull",
        CancellationToken cancellationToken = default)
    {
        var url = $"{_settings.BaseUrl}/api/v1/market-data/search" +
                  $"?{filterField}={Uri.EscapeDataString(value)}" +
                  "&fields=instrumentId,symbolFull,internalSymbolFull,instrumentDisplayName,internalAssetClassName,instrumentTypeId,isActive,isTradable";

        var response = await SendRequestAsync(url, cancellationToken);
        if (response == null) return [];

        try
        {
            var searchResponse = JsonSerializer.Deserialize<EtoroSearchResponse>(response, JsonOptions);
            return searchResponse?.Items ?? [];
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse eToro search response for {Value}", value);
            return [];
        }
    }

    public async Task<List<EtoroCandle>> GetCandlesAsync(
        int instrumentId,
        string interval,
        string direction = "desc",
        int count = 100,
        CancellationToken cancellationToken = default)
    {
        var url = $"{_settings.BaseUrl}/api/v1/market-data/instruments/{instrumentId}/history/candles/{direction}/{interval}/{count}";

        var response = await SendRequestAsync(url, cancellationToken);
        if (response == null) return [];

        try
        {
            var candlesResponse = JsonSerializer.Deserialize<EtoroCandlesResponse>(response, JsonOptions);
            return candlesResponse?.CandleGroups.FirstOrDefault()?.Candles ?? [];
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse eToro candles for instrument {InstrumentId}", instrumentId);
            return [];
        }
    }

    private async Task<string?> SendRequestAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("X-Api-Key", _settings.ApiKey);
            request.Headers.Add("X-User-Key", _settings.UserKey);
            request.Headers.Add("x-request-id", Guid.NewGuid().ToString());

            var urlForLogging = url.Contains('?') ? url[..url.IndexOf('?')] + "?..." : url;
            _logger.LogDebug("eToro API Request: {Url}", urlForLogging);

            var response = await _httpClient.SendAsync(request, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("eToro API error {StatusCode} for {Url}: {Content}",
                    response.StatusCode, urlForLogging, content);
                return null;
            }

            return content;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error calling eToro API: {Url}", url);
            return null;
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(ex, "Timeout calling eToro API: {Url}", url);
            return null;
        }
    }
}
