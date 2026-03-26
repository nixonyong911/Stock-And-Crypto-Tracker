using System.Text.Json;
using DataFetcher.Worker.Application.Providers.GNews;
using DataFetcher.Worker.Configuration.Providers;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.GNews;

public class GNewsApiClient : IGNewsApiClient
{
    private readonly HttpClient _httpClient;
    private readonly GNewsSettings _settings;
    private readonly ILogger<GNewsApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions;

    public GNewsApiClient(
        HttpClient httpClient,
        IOptions<GNewsSettings> settings,
        ILogger<GNewsApiClient> logger)
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

    public async Task<GNewsResponse?> FetchTopHeadlinesAsync(
        string category,
        int max = 10,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"top-headlines?apikey={_settings.ApiKey}&category={Uri.EscapeDataString(category)}&lang=en&max={max}";
            _logger.LogDebug("Fetching GNews headlines: category={Category}, max={Max}", category, max);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(content))
            {
                _logger.LogWarning("Empty response from GNews for category {Category}", category);
                return null;
            }

            return JsonSerializer.Deserialize<GNewsResponse>(content, _jsonOptions);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
        {
            _logger.LogWarning("GNews rate limit hit (429). Will retry next cycle.");
            return null;
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Forbidden)
        {
            _logger.LogWarning("GNews API returned 403 -- daily request limit likely exhausted.");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching headlines from GNews (category={Category})", category);
            throw;
        }
    }
}
