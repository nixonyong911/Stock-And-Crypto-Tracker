using Dapper;
using DataFetcher.Worker.Application.Providers.GNews;
using DataFetcher.Worker.Domain.Providers.GNews.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.GNews.Repositories;

public class GNewsArticleRepository : IGNewsArticleRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<GNewsArticleRepository> _logger;

    public GNewsArticleRepository(IDbConnectionFactory connectionFactory, ILogger<GNewsArticleRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task UpsertAsync(GNewsArticleEntity article)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO unfiltered_news_gnews (
                gnews_id, title, description, content_excerpt,
                url, image_url, source_name, source_url,
                published_at, language, search_category, created_at
            ) VALUES (
                @GnewsId, @Title, @Description, @ContentExcerpt,
                @Url, @ImageUrl, @SourceName, @SourceUrl,
                @PublishedAt, @Language, @SearchCategory, NOW()
            )
            ON CONFLICT (gnews_id)
            DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                content_excerpt = EXCLUDED.content_excerpt";

        await connection.ExecuteAsync(sql, article);
        _logger.LogDebug("Upserted GNews article {GnewsId}: {Title}", article.GnewsId, article.Title);
    }

    public async Task<int> CleanupOldArticlesAsync(int retentionDays = 30)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            DELETE FROM unfiltered_news_gnews
            WHERE published_at < NOW() - MAKE_INTERVAL(days => @RetentionDays)";

        var deleted = await connection.ExecuteAsync(sql, new { RetentionDays = retentionDays });
        if (deleted > 0)
        {
            _logger.LogInformation("Cleaned up {Count} GNews articles older than {Days} days", deleted, retentionDays);
        }
        return deleted;
    }

    public async Task<DateTime?> GetLatestPublishedAtByCategoryAsync(string category)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT MAX(published_at)
            FROM unfiltered_news_gnews
            WHERE search_category = @Category";

        return await connection.QuerySingleOrDefaultAsync<DateTime?>(sql, new { Category = category });
    }
}
