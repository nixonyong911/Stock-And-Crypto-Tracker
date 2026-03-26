using DataFetcher.Worker.Application.Providers.GNews;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class GNewsFetchServiceTests
{
    [Fact]
    public void MapToEntity_ValidArticle_MapsCorrectly()
    {
        var article = new GNewsArticleDto
        {
            Id = "abc123def456abc123def456abc12345",
            Title = "Test Headline",
            Description = "Short description of the article.",
            Content = "The article body starts here and continues with more details... [5000 chars]",
            Url = "https://example.com/article",
            Image = "https://example.com/image.jpg",
            PublishedAt = new DateTime(2026, 3, 26, 12, 0, 0, DateTimeKind.Utc),
            Lang = "en",
            Source = new GNewsSourceDto
            {
                Id = "src123",
                Name = "Example News",
                Url = "https://example.com"
            }
        };

        var entity = GNewsFetchService.MapToEntity(article, "business");

        Assert.Equal("abc123def456abc123def456abc12345", entity.GnewsId);
        Assert.Equal("Test Headline", entity.Title);
        Assert.Equal("Short description of the article.", entity.Description);
        Assert.Equal("https://example.com/article", entity.Url);
        Assert.Equal("https://example.com/image.jpg", entity.ImageUrl);
        Assert.Equal("Example News", entity.SourceName);
        Assert.Equal("https://example.com", entity.SourceUrl);
        Assert.Equal("en", entity.Language);
        Assert.Equal("business", entity.SearchCategory);
    }

    [Fact]
    public void MapToEntity_ContentWithCharsSuffix_StripsIt()
    {
        var article = new GNewsArticleDto
        {
            Id = "test123",
            Title = "Test",
            Content = "The article body starts here and continues with more details... [5000 chars]",
            Url = "https://example.com",
            Source = new GNewsSourceDto { Name = "Test" }
        };

        var entity = GNewsFetchService.MapToEntity(article, "general");

        Assert.DoesNotContain("[5000 chars]", entity.ContentExcerpt);
        Assert.Equal("The article body starts here and continues with more details", entity.ContentExcerpt);
    }

    [Fact]
    public void MapToEntity_ContentWithoutSuffix_PreservesContent()
    {
        var article = new GNewsArticleDto
        {
            Id = "test456",
            Title = "Test",
            Content = "Short content that doesn't have truncation marker",
            Url = "https://example.com",
            Source = new GNewsSourceDto { Name = "Test" }
        };

        var entity = GNewsFetchService.MapToEntity(article, "world");

        Assert.Equal("Short content that doesn't have truncation marker", entity.ContentExcerpt);
    }

    [Fact]
    public void MapToEntity_NullContent_HandlesGracefully()
    {
        var article = new GNewsArticleDto
        {
            Id = "test789",
            Title = "Test",
            Content = null,
            Url = "https://example.com",
            Source = new GNewsSourceDto { Name = "Test" }
        };

        var entity = GNewsFetchService.MapToEntity(article, "general");

        Assert.Null(entity.ContentExcerpt);
    }
}
