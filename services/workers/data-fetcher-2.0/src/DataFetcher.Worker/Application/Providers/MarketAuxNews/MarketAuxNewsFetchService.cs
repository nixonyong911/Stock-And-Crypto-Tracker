using System.Text.Json;
using DataFetcher.Worker.Domain.Providers.MarketAuxNews.Entities;

namespace DataFetcher.Worker.Application.Providers.MarketAuxNews;

public class MarketAuxNewsFetchService : IMarketAuxNewsFetchService
{
    private readonly IMarketAuxApiClient _apiClient;
    private readonly INewsArticleRepository _repository;
    private readonly ILogger<MarketAuxNewsFetchService> _logger;

    private static readonly Dictionary<string, string> SearchQueries = new()
    {
        ["macro"] = "fed rate OR fomc OR inflation OR cpi OR gdp OR unemployment",
        ["geopolitical"] = "tariff OR trade war OR sanctions OR war OR conflict",
        ["policy"] = "trump OR executive order OR regulation OR legislation",
    };

    private const string MarketEntityType = "index";

    public MarketAuxNewsFetchService(
        IMarketAuxApiClient apiClient,
        INewsArticleRepository repository,
        ILogger<MarketAuxNewsFetchService> logger)
    {
        _apiClient = apiClient;
        _repository = repository;
        _logger = logger;
    }

    public async Task<MarketAuxFetchResult> FetchAndStoreNewsAsync(
        string? publishedAfter = null,
        CancellationToken cancellationToken = default)
    {
        var result = new MarketAuxFetchResult();

        foreach (var (category, searchQuery) in SearchQueries)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var response = await _apiClient.FetchNewsAsync(searchQuery, publishedAfter, cancellationToken: cancellationToken);
                result.RequestsMade++;

                if (response?.Data == null || response.Data.Count == 0)
                {
                    _logger.LogDebug("No articles returned for category '{Category}'", category);
                    continue;
                }

                result.ArticlesFetched += response.Data.Count;

                foreach (var article in response.Data)
                {
                    try
                    {
                        var entity = MapToEntity(article, category);
                        await _repository.UpsertAsync(entity);
                        result.ArticlesStored++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to store article {Uuid}", article.Uuid);
                        result.Errors.Add($"{article.Uuid}: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch news for category '{Category}'", category);
                result.Errors.Add($"category:{category}: {ex.Message}");
            }
        }

        // Market-wide query (entity_types=index, no search param)
        if (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var response = await _apiClient.FetchNewsAsync(string.Empty, publishedAfter, entityTypes: MarketEntityType, cancellationToken: cancellationToken);
                result.RequestsMade++;

                if (response?.Data != null)
                {
                    result.ArticlesFetched += response.Data.Count;
                    foreach (var article in response.Data)
                    {
                        try
                        {
                            var entity = MapToEntity(article, "market");
                            await _repository.UpsertAsync(entity);
                            result.ArticlesStored++;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to store market article {Uuid}", article.Uuid);
                            result.Errors.Add($"{article.Uuid}: {ex.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch market-wide news");
                result.Errors.Add($"category:market: {ex.Message}");
            }
        }

        return result;
    }

    internal static NewsArticle MapToEntity(MarketAuxArticle article, string category)
    {
        var compactEntities = article.Entities.Select(e => new CompactEntity
        {
            Symbol = e.Symbol,
            Name = e.Name,
            Type = e.Type,
            SentimentScore = e.SentimentScore,
            MatchScore = e.MatchScore
        }).ToList();

        var avgSentiment = compactEntities.Count > 0
            ? (decimal)compactEntities.Average(e => e.SentimentScore)
            : (decimal?)null;

        var sentimentLabel = avgSentiment switch
        {
            >= 0.2m => "positive",
            <= -0.2m => "negative",
            _ => "neutral"
        };

        return new NewsArticle
        {
            MarketauxUuid = article.Uuid,
            Title = article.Title,
            Description = article.Description,
            Snippet = article.Snippet,
            Keywords = article.Keywords,
            Url = article.Url,
            Source = article.Source,
            PublishedAt = article.PublishedAt,
            Language = article.Language,
            Entities = JsonSerializer.Serialize(compactEntities),
            AvgSentimentScore = avgSentiment,
            SentimentLabel = sentimentLabel,
            EntityCount = compactEntities.Count,
            SearchCategory = category
        };
    }
}
