using System.Text.Json;
using DataFetcher.Worker.Application.Providers.MarketAuxNews;
using DataFetcher.Worker.Configuration.Providers;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.MarketAuxNews;

public class MarketAuxApiClient : IMarketAuxApiClient
{
    private readonly HttpClient _httpClient;
    private readonly MarketAuxSettings _settings;
    private readonly ILogger<MarketAuxApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions;

    public MarketAuxApiClient(
        HttpClient httpClient,
        IOptions<MarketAuxSettings> settings,
        ILogger<MarketAuxApiClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
        _httpClient.BaseAddress = new Uri(_settings.BaseUrl.TrimEnd('/') + "/");
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
    }

    public async Task<MarketAuxResponse?> FetchNewsAsync(
        string searchQuery,
        string? publishedAfter = null,
        string? entityTypes = null,
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var queryParams = new List<string>
            {
                $"api_token={_settings.ApiKey}",
                "language=en",
                "must_have_entities=true",
                "group_similar=true",
                "limit=3",
                "sort=published_at"
            };

            if (!string.IsNullOrEmpty(searchQuery))
                queryParams.Add($"search={Uri.EscapeDataString(searchQuery)}");

            if (!string.IsNullOrEmpty(publishedAfter))
                queryParams.Add($"published_after={publishedAfter}");

            if (!string.IsNullOrEmpty(entityTypes))
                queryParams.Add($"entity_types={Uri.EscapeDataString(entityTypes)}");

            if (page > 1)
                queryParams.Add($"page={page}");

            var url = $"news/all?{string.Join("&", queryParams)}";
            _logger.LogDebug("Fetching MarketAux news: {Url}", url.Replace(_settings.ApiKey, "***"));

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content))
            {
                _logger.LogWarning("Empty response from MarketAux");
                return null;
            }

            return JsonSerializer.Deserialize<MarketAuxResponse>(content, _jsonOptions);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
        {
            _logger.LogWarning("MarketAux rate limit hit (429). Will retry next cycle.");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching news from MarketAux");
            throw;
        }
    }
}
