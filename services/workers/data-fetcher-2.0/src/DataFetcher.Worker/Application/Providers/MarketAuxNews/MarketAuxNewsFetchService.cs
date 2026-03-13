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
    private const int FocusedQueryMaxPages = 5;
    private const int FreetierPageLimit = 3;

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
        int cycleBudget = 25,
        CancellationToken cancellationToken = default)
    {
        var result = new MarketAuxFetchResult();
        var defaultAfter = DateTime.UtcNow.AddHours(-6).ToString("yyyy-MM-ddTHH:mm");

        // Step 1: Focused queries (macro, geopolitical, policy) -- capped at 5 pages each
        foreach (var (category, searchQuery) in SearchQueries)
        {
            if (cancellationToken.IsCancellationRequested || result.RequestsMade >= cycleBudget)
                break;

            try
            {
                var publishedAfter = await GetPublishedAfterForCategory(category, defaultAfter);
                var pagesUsed = await FetchCategoryWithPagination(
                    result, searchQuery, publishedAfter, null,
                    category, FocusedQueryMaxPages, cycleBudget,
                    cancellationToken);

                _logger.LogDebug("Category '{Category}': {Pages} pages fetched", category, pagesUsed);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch news for category '{Category}'", category);
                result.Errors.Add($"category:{category}: {ex.Message}");
            }
        }

        // Step 2: Market/index -- gets ALL remaining budget
        if (!cancellationToken.IsCancellationRequested && result.RequestsMade < cycleBudget)
        {
            try
            {
                var remaining = cycleBudget - result.RequestsMade;
                var publishedAfter = await GetPublishedAfterForCategory("market", defaultAfter);
                var pagesUsed = await FetchCategoryWithPagination(
                    result, string.Empty, publishedAfter, MarketEntityType,
                    "market", remaining, cycleBudget,
                    cancellationToken);

                _logger.LogDebug("Category 'market': {Pages} pages fetched (budget remaining: {Remaining})",
                    pagesUsed, remaining);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch market-wide news");
                result.Errors.Add($"category:market: {ex.Message}");
            }
        }

        return result;
    }

    private async Task<int> FetchCategoryWithPagination(
        MarketAuxFetchResult result,
        string searchQuery,
        string publishedAfter,
        string? entityTypes,
        string category,
        int maxPages,
        int cycleBudget,
        CancellationToken cancellationToken)
    {
        var pagesUsed = 0;

        for (var page = 1; page <= maxPages; page++)
        {
            if (cancellationToken.IsCancellationRequested || result.RequestsMade >= cycleBudget)
                break;

            var response = await _apiClient.FetchNewsAsync(
                searchQuery, publishedAfter, entityTypes, page, cancellationToken);
            result.RequestsMade++;
            pagesUsed++;

            if (response?.Data == null || response.Data.Count == 0)
                break;

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

            if (response.Meta.Returned < FreetierPageLimit)
                break;
        }

        return pagesUsed;
    }

    private async Task<string> GetPublishedAfterForCategory(string category, string fallback)
    {
        try
        {
            var latest = await _repository.GetLatestPublishedAtByCategoryAsync(category);
            if (latest.HasValue)
                return latest.Value.ToString("yyyy-MM-ddTHH:mm:ss");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get latest published_at for category '{Category}', using fallback", category);
        }
        return fallback;
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
