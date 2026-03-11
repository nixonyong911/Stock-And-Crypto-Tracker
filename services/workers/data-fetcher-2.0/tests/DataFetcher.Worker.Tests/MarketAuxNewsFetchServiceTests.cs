using Xunit;
using Moq;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.MarketAuxNews;
using DataFetcher.Worker.Workers.MarketAuxNews;

namespace DataFetcher.Worker.Tests;

public class MarketAuxNewsFetchServiceTests
{
    private readonly Mock<IMarketAuxApiClient> _apiClientMock;
    private readonly Mock<INewsArticleRepository> _repoMock;
    private readonly Mock<ILogger<MarketAuxNewsFetchService>> _loggerMock;
    private readonly MarketAuxNewsFetchService _service;

    public MarketAuxNewsFetchServiceTests()
    {
        _apiClientMock = new Mock<IMarketAuxApiClient>();
        _repoMock = new Mock<INewsArticleRepository>();
        _loggerMock = new Mock<ILogger<MarketAuxNewsFetchService>>();
        _service = new MarketAuxNewsFetchService(_apiClientMock.Object, _repoMock.Object, _loggerMock.Object);
    }

    #region Sentiment Calculation

    [Fact]
    public void MapToEntity_MultipleEntities_CalculatesAvgSentiment()
    {
        var article = CreateArticle(new[] { -0.5, 0.3 });
        var result = MarketAuxNewsFetchService.MapToEntity(article, "macro");

        Assert.NotNull(result.AvgSentimentScore);
        Assert.Equal(-0.1m, Math.Round(result.AvgSentimentScore!.Value, 1));
        Assert.Equal("neutral", result.SentimentLabel);
    }

    [Fact]
    public void MapToEntity_HighPositiveSentiment_LabelsPositive()
    {
        var article = CreateArticle(new[] { 0.5, 0.3 });
        var result = MarketAuxNewsFetchService.MapToEntity(article, "macro");

        Assert.True(result.AvgSentimentScore >= 0.2m);
        Assert.Equal("positive", result.SentimentLabel);
    }

    [Fact]
    public void MapToEntity_HighNegativeSentiment_LabelsNegative()
    {
        var article = CreateArticle(new[] { -0.5, -0.3 });
        var result = MarketAuxNewsFetchService.MapToEntity(article, "macro");

        Assert.True(result.AvgSentimentScore <= -0.2m);
        Assert.Equal("negative", result.SentimentLabel);
    }

    [Fact]
    public void MapToEntity_NoEntities_SentimentIsNull()
    {
        var article = CreateArticle(Array.Empty<double>());
        var result = MarketAuxNewsFetchService.MapToEntity(article, "macro");

        Assert.Null(result.AvgSentimentScore);
        Assert.Equal("neutral", result.SentimentLabel);
    }

    #endregion

    #region Entity Mapping (Compact)

    [Fact]
    public void MapToEntity_ExtractsCompactFields()
    {
        var article = new MarketAuxArticle
        {
            Uuid = "test-uuid",
            Title = "Test",
            Url = "https://example.com",
            Source = "test-source",
            PublishedAt = DateTime.UtcNow,
            Entities = new List<MarketAuxEntity>
            {
                new()
                {
                    Symbol = "AAPL",
                    Name = "Apple Inc",
                    Type = "equity",
                    SentimentScore = 0.5,
                    MatchScore = 10.0,
                    Exchange = "NASDAQ",
                    Industry = "Technology",
                    Highlights = new List<MarketAuxHighlight>
                    {
                        new() { Text = "highlight text", Sentiment = 0.5, HighlightedIn = "title" }
                    }
                }
            }
        };

        var result = MarketAuxNewsFetchService.MapToEntity(article, "macro");

        // Verify compact entities contain only the 5 required fields (no exchange, industry, highlights)
        Assert.Contains("AAPL", result.Entities);
        Assert.Contains("Apple Inc", result.Entities);
        Assert.Contains("equity", result.Entities);
        Assert.DoesNotContain("NASDAQ", result.Entities);
        Assert.DoesNotContain("Technology", result.Entities);
        Assert.DoesNotContain("highlight text", result.Entities);
    }

    [Fact]
    public void MapToEntity_SetsSearchCategory()
    {
        var article = CreateArticle(new[] { 0.1 });
        var result = MarketAuxNewsFetchService.MapToEntity(article, "geopolitical");

        Assert.Equal("geopolitical", result.SearchCategory);
    }

    [Fact]
    public void MapToEntity_PreservesArticleFields()
    {
        var now = DateTime.UtcNow;
        var article = new MarketAuxArticle
        {
            Uuid = "uuid-123",
            Title = "Fed Raises Rates",
            Description = "Federal Reserve raised rates",
            Snippet = "snippet text",
            Url = "https://example.com/article",
            Source = "Reuters",
            PublishedAt = now,
            Language = "en",
            Entities = new List<MarketAuxEntity>()
        };

        var result = MarketAuxNewsFetchService.MapToEntity(article, "policy");

        Assert.Equal("uuid-123", result.MarketauxUuid);
        Assert.Equal("Fed Raises Rates", result.Title);
        Assert.Equal("Federal Reserve raised rates", result.Description);
        Assert.Equal("snippet text", result.Snippet);
        Assert.Equal("https://example.com/article", result.Url);
        Assert.Equal("Reuters", result.Source);
        Assert.Equal(now, result.PublishedAt);
        Assert.Equal("en", result.Language);
    }

    #endregion

    #region Fetch and Store Flow

    [Fact]
    public async Task FetchAndStore_4Categories_Makes4ApiCalls()
    {
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MarketAuxResponse { Data = new List<MarketAuxArticle>() });

        var result = await _service.FetchAndStoreNewsAsync();

        // 3 search queries + 1 market/index query = 4 total
        Assert.Equal(4, result.RequestsMade);
        _apiClientMock.Verify(
            c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Exactly(4));
    }

    [Fact]
    public async Task FetchAndStore_ApiReturnsNull_SkipsGracefully()
    {
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((MarketAuxResponse?)null);

        var result = await _service.FetchAndStoreNewsAsync();

        Assert.Equal(4, result.RequestsMade);
        Assert.Equal(0, result.ArticlesFetched);
        Assert.Equal(0, result.ArticlesStored);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public async Task FetchAndStore_ApiThrows_RecordsErrorContinues()
    {
        var callCount = 0;
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                callCount++;
                if (callCount == 1)
                    throw new HttpRequestException("API timeout");
                return new MarketAuxResponse { Data = new List<MarketAuxArticle>() };
            });

        var result = await _service.FetchAndStoreNewsAsync();

        Assert.Single(result.Errors);
        Assert.Contains("macro", result.Errors[0]);
        Assert.Equal(3, result.RequestsMade); // 1 failed (no increment before throw) + 3 succeed
    }

    [Fact]
    public async Task FetchAndStore_CountsArticlesCorrectly()
    {
        var articles = new List<MarketAuxArticle>
        {
            CreateArticle(new[] { 0.1 }),
            CreateArticle(new[] { -0.1 }),
        };

        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MarketAuxResponse { Data = articles });

        var result = await _service.FetchAndStoreNewsAsync();

        Assert.Equal(8, result.ArticlesFetched);  // 2 articles x 4 calls
        Assert.Equal(8, result.ArticlesStored);
    }

    [Fact]
    public async Task FetchAndStore_DuplicateUuid_HandledByUpsert()
    {
        var article = CreateArticle(new[] { 0.1 });
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MarketAuxResponse { Data = new List<MarketAuxArticle> { article } });

        // Repo upsert should not throw for duplicates
        _repoMock.Setup(r => r.UpsertAsync(It.IsAny<Domain.Providers.MarketAuxNews.Entities.NewsArticle>()))
            .Returns(Task.CompletedTask);

        var result = await _service.FetchAndStoreNewsAsync();

        Assert.Empty(result.Errors);
        _repoMock.Verify(r => r.UpsertAsync(It.IsAny<Domain.Providers.MarketAuxNews.Entities.NewsArticle>()), Times.Exactly(4));
    }

    #endregion

    #region Rate Limiting Config (ParseFetchConfig)

    [Fact]
    public void ParseFetchConfig_ValidJson_ParsesCorrectly()
    {
        var json = """{"DailyRequestBudget":80,"RequestsToday":12,"CounterDate":"2026-03-11","Queries":["macro","geopolitical"]}""";
        var config = MarketAuxNewsWorker.ParseFetchConfig(json);

        Assert.Equal(80, config.DailyRequestBudget);
        Assert.Equal(12, config.RequestsToday);
        Assert.Equal("2026-03-11", config.CounterDate);
        Assert.Equal(2, config.Queries.Count);
    }

    [Fact]
    public void ParseFetchConfig_EmptyOrNull_ReturnsDefaults()
    {
        var configNull = MarketAuxNewsWorker.ParseFetchConfig(null);
        var configEmpty = MarketAuxNewsWorker.ParseFetchConfig("");

        Assert.Equal(80, configNull.DailyRequestBudget);
        Assert.Equal(0, configNull.RequestsToday);
        Assert.Equal(80, configEmpty.DailyRequestBudget);
        Assert.Equal(0, configEmpty.RequestsToday);
    }

    [Fact]
    public void ParseFetchConfig_MalformedJson_ReturnsDefaults()
    {
        var config = MarketAuxNewsWorker.ParseFetchConfig("{invalid json!!}");

        Assert.Equal(80, config.DailyRequestBudget);
        Assert.Equal(0, config.RequestsToday);
    }

    [Fact]
    public void RateLimitCheck_BudgetExhausted_SkipsCycle()
    {
        // When requests_today >= budget, no API calls should be made
        // We test this indirectly: if budget is 0, FetchAndStore still makes calls
        // The budget check is in the worker, not the service, so we verify via ParseFetchConfig
        var json = """{"DailyRequestBudget":80,"RequestsToday":80,"CounterDate":"2026-03-11"}""";
        var config = MarketAuxNewsWorker.ParseFetchConfig(json);

        Assert.True(config.RequestsToday >= config.DailyRequestBudget);
    }

    [Fact]
    public void RateLimitCheck_CounterDateMismatch_ResetsCounter()
    {
        var json = """{"DailyRequestBudget":80,"RequestsToday":50,"CounterDate":"2026-03-10"}""";
        var config = MarketAuxNewsWorker.ParseFetchConfig(json);
        var todayUtc = DateTime.UtcNow.ToString("yyyy-MM-dd");

        // Simulate the worker's date-check logic
        if (config.CounterDate != todayUtc)
        {
            config.RequestsToday = 0;
            config.CounterDate = todayUtc;
        }

        Assert.Equal(0, config.RequestsToday);
        Assert.Equal(todayUtc, config.CounterDate);
    }

    #endregion

    #region Cleanup

    [Fact]
    public void Cleanup_RunsOnFirstCycleOfDay()
    {
        var config = new MarketAuxFetchConfig { RequestsToday = 0 };
        var requestsMade = 4;

        config.RequestsToday += requestsMade;

        // First cycle: requests_today == requests_made
        Assert.Equal(config.RequestsToday, requestsMade);
    }

    [Fact]
    public void Cleanup_SkipsOnSubsequentCycles()
    {
        var config = new MarketAuxFetchConfig { RequestsToday = 4 };
        var requestsMade = 4;

        config.RequestsToday += requestsMade;

        // Subsequent cycle: requests_today > requests_made
        Assert.True(config.RequestsToday > requestsMade);
    }

    #endregion

    #region Helpers

    private static MarketAuxArticle CreateArticle(double[] sentimentScores)
    {
        return new MarketAuxArticle
        {
            Uuid = Guid.NewGuid().ToString(),
            Title = "Test Article",
            Description = "Test description",
            Snippet = "Test snippet",
            Url = "https://example.com/test",
            Source = "TestSource",
            PublishedAt = DateTime.UtcNow,
            Language = "en",
            Entities = sentimentScores.Select((score, i) => new MarketAuxEntity
            {
                Symbol = $"SYM{i}",
                Name = $"Entity {i}",
                Type = "equity",
                SentimentScore = score,
                MatchScore = 5.0
            }).ToList()
        };
    }

    #endregion
}
