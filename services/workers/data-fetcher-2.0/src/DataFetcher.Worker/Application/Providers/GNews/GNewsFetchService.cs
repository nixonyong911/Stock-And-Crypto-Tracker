using System.Text.RegularExpressions;
using DataFetcher.Worker.Domain.Providers.GNews.Entities;

namespace DataFetcher.Worker.Application.Providers.GNews;

public class GNewsFetchService : IGNewsFetchService
{
    private readonly IGNewsApiClient _apiClient;
    private readonly IGNewsArticleRepository _repository;
    private readonly ILogger<GNewsFetchService> _logger;

    private static readonly Regex ContentSuffixPattern = new(@"\s*\[\d+ chars\]\s*$", RegexOptions.Compiled);

    public GNewsFetchService(
        IGNewsApiClient apiClient,
        IGNewsArticleRepository repository,
        ILogger<GNewsFetchService> logger)
    {
        _apiClient = apiClient;
        _repository = repository;
        _logger = logger;
    }

    public async Task<GNewsFetchResult> FetchAndStoreHeadlinesAsync(
        List<string> categories,
        int cycleBudget = 10,
        CancellationToken cancellationToken = default)
    {
        var result = new GNewsFetchResult();

        foreach (var category in categories)
        {
            if (cancellationToken.IsCancellationRequested || result.RequestsMade >= cycleBudget)
                break;

            try
            {
                var response = await _apiClient.FetchTopHeadlinesAsync(category, 10, cancellationToken);
                result.RequestsMade++;

                if (response?.Articles == null || response.Articles.Count == 0)
                {
                    _logger.LogDebug("No articles returned for GNews category '{Category}'", category);
                    continue;
                }

                result.ArticlesFetched += response.Articles.Count;

                foreach (var article in response.Articles)
                {
                    try
                    {
                        var entity = MapToEntity(article, category);
                        await _repository.UpsertAsync(entity);
                        result.ArticlesStored++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to store GNews article {Id}", article.Id);
                        result.Errors.Add($"{article.Id}: {ex.Message}");
                    }
                }

                _logger.LogDebug("GNews category '{Category}': {Count} articles fetched", category, response.Articles.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch GNews headlines for category '{Category}'", category);
                result.Errors.Add($"category:{category}: {ex.Message}");
            }
        }

        return result;
    }

    internal static GNewsArticleEntity MapToEntity(GNewsArticleDto article, string category)
    {
        var contentExcerpt = article.Content;
        if (!string.IsNullOrEmpty(contentExcerpt))
            contentExcerpt = ContentSuffixPattern.Replace(contentExcerpt, "").TrimEnd('.', ' ');

        return new GNewsArticleEntity
        {
            GnewsId = article.Id,
            Title = article.Title,
            Description = article.Description,
            ContentExcerpt = contentExcerpt,
            Url = article.Url,
            ImageUrl = article.Image,
            SourceName = article.Source.Name,
            SourceUrl = article.Source.Url,
            PublishedAt = article.PublishedAt,
            Language = article.Lang,
            SearchCategory = category
        };
    }
}
