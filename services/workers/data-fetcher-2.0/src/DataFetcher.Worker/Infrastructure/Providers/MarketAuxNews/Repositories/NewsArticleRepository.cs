using Dapper;
using DataFetcher.Worker.Application.Providers.MarketAuxNews;
using DataFetcher.Worker.Domain.Providers.MarketAuxNews.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.MarketAuxNews.Repositories;

public class NewsArticleRepository : INewsArticleRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<NewsArticleRepository> _logger;

    public NewsArticleRepository(IDbConnectionFactory connectionFactory, ILogger<NewsArticleRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task UpsertAsync(NewsArticle article)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO unfiltered_news_marketaux (
                marketaux_uuid, title, description, snippet, keywords,
                url, source, published_at, language,
                entities, avg_sentiment_score, sentiment_label,
                entity_count, search_category, created_at
            ) VALUES (
                @MarketauxUuid, @Title, @Description, @Snippet, @Keywords,
                @Url, @Source, @PublishedAt, @Language,
                @Entities::jsonb, @AvgSentimentScore, @SentimentLabel,
                @EntityCount, @SearchCategory, NOW()
            )
            ON CONFLICT (marketaux_uuid)
            DO UPDATE SET
                title = EXCLUDED.title,
                entities = EXCLUDED.entities,
                avg_sentiment_score = EXCLUDED.avg_sentiment_score,
                sentiment_label = EXCLUDED.sentiment_label,
                entity_count = EXCLUDED.entity_count";

        await connection.ExecuteAsync(sql, article);
        _logger.LogDebug("Upserted news article {Uuid}: {Title}", article.MarketauxUuid, article.Title);
    }

    public async Task<int> CleanupOldArticlesAsync(int retentionDays = 30)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            DELETE FROM unfiltered_news_marketaux
            WHERE published_at < NOW() - MAKE_INTERVAL(days => @RetentionDays)";

        var deleted = await connection.ExecuteAsync(sql, new { RetentionDays = retentionDays });
        if (deleted > 0)
        {
            _logger.LogInformation("Cleaned up {Count} news articles older than {Days} days", deleted, retentionDays);
        }
        return deleted;
    }

    public async Task<DateTime?> GetLatestPublishedAtByCategoryAsync(string category)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT MAX(published_at)
            FROM unfiltered_news_marketaux
            WHERE search_category = @Category";

        return await connection.QuerySingleOrDefaultAsync<DateTime?>(sql, new { Category = category });
    }
}
