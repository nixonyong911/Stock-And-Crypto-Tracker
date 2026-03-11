namespace DataFetcher.Worker.Application.Providers.MarketAuxNews;

public interface INewsArticleRepository
{
    Task UpsertAsync(Domain.Providers.MarketAuxNews.Entities.NewsArticle article);
    Task<int> CleanupOldArticlesAsync(int retentionDays = 30);
}
