using DataFetcher.Worker.Domain.Providers.GNews.Entities;

namespace DataFetcher.Worker.Application.Providers.GNews;

public interface IGNewsArticleRepository
{
    Task UpsertAsync(GNewsArticleEntity article);
    Task<int> CleanupOldArticlesAsync(int retentionDays = 30);
    Task<DateTime?> GetLatestPublishedAtByCategoryAsync(string category);
}
