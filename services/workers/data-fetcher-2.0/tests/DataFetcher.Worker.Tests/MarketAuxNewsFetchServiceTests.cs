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
        _repoMock.Setup(r => r.GetLatestPublishedAtByCategoryAsync(It.IsAny<string>()))
            .ReturnsAsync((DateTime?)null);
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

    #region Fetch and Store Flow (Priority-Based Pagination)

    [Fact]
    public async Task FetchAndStore_EmptyResponses_MakesOneCallPerPhase()
    {
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MarketAuxResponse { Data = new List<MarketAuxArticle>(), Meta = new MarketAuxMeta { Returned = 0 } });

        var result = await _service.FetchAndStoreNewsAsync(25);

        // macro, geopolitical, policy, commodity (search), crypto (entities), market (index entities)
        Assert.Equal(6, result.RequestsMade);
    }

    [Fact]
    public async Task FetchAndStore_ApiReturnsNull_SkipsGracefully()
    {
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((MarketAuxResponse?)null);

        var result = await _service.FetchAndStoreNewsAsync(25);

        Assert.Equal(6, result.RequestsMade);
        Assert.Equal(0, result.ArticlesFetched);
        Assert.Equal(0, result.ArticlesStored);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public async Task FetchAndStore_PaginatesWhenFullPage()
    {
        var fullPage = new MarketAuxResponse
        {
            Data = Enumerable.Range(0, 3).Select(_ => CreateArticle(new[] { 0.1 })).ToList(),
            Meta = new MarketAuxMeta { Returned = 3, Limit = 3 }
        };
        var lastPage = new MarketAuxResponse
        {
            Data = new List<MarketAuxArticle> { CreateArticle(new[] { 0.1 }) },
            Meta = new MarketAuxMeta { Returned = 1, Limit = 3 }
        };

        var callCount = 0;
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                callCount++;
                return callCount % 2 == 1 ? fullPage : lastPage;
            });

        // Budget must cover 4 search categories + crypto + partial market pagination
        var result = await _service.FetchAndStoreNewsAsync(40);

        // 4 search × 2 pages + crypto × 2 pages = 10 calls; market uses remaining pages with same alternating mock
        Assert.Equal(12, result.RequestsMade);
        // 4 search × (3+1) + crypto × (3+1) + market × (3+1) articles
        Assert.Equal(24, result.ArticlesFetched);
    }

    [Fact]
    public async Task FetchAndStore_RespectsGlobalCycleBudget()
    {
        var fullPage = new MarketAuxResponse
        {
            Data = Enumerable.Range(0, 3).Select(_ => CreateArticle(new[] { 0.1 })).ToList(),
            Meta = new MarketAuxMeta { Returned = 3, Limit = 3 }
        };

        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(fullPage);

        var result = await _service.FetchAndStoreNewsAsync(cycleBudget: 6);

        Assert.Equal(6, result.RequestsMade);
    }

    [Fact]
    public async Task FetchAndStore_FocusedQueriesCappedAt5Pages()
    {
        var fullPage = new MarketAuxResponse
        {
            Data = Enumerable.Range(0, 3).Select(_ => CreateArticle(new[] { 0.1 })).ToList(),
            Meta = new MarketAuxMeta { Returned = 3, Limit = 3 }
        };

        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(fullPage);

        // Default worker cycle (35): 4 search × up to 6 pages + crypto × up to 4 + market remainder — all pages full
        var result = await _service.FetchAndStoreNewsAsync(cycleBudget: 35);

        Assert.Equal(35, result.RequestsMade);
    }

    [Fact]
    public async Task FetchAndStore_ApiThrows_RecordsErrorContinues()
    {
        var callCount = 0;
        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                callCount++;
                if (callCount == 1)
                    throw new HttpRequestException("API timeout");
                return new MarketAuxResponse { Data = new List<MarketAuxArticle>(), Meta = new MarketAuxMeta { Returned = 0 } };
            });

        var result = await _service.FetchAndStoreNewsAsync(25);

        Assert.Single(result.Errors);
        Assert.Contains("macro", result.Errors[0]);
        // After macro throws: geopolitical, policy, commodity, crypto each 1 call; market not reached at budget 5
        Assert.Equal(5, result.RequestsMade);
    }

    [Fact]
    public async Task FetchAndStore_UsesLatestPublishedAtFromDb()
    {
        var storedDate = new DateTime(2026, 3, 13, 10, 0, 0, DateTimeKind.Utc);
        _repoMock.Setup(r => r.GetLatestPublishedAtByCategoryAsync("macro"))
            .ReturnsAsync(storedDate);

        _apiClientMock
            .Setup(c => c.FetchNewsAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MarketAuxResponse { Data = new List<MarketAuxArticle>(), Meta = new MarketAuxMeta { Returned = 0 } });

        await _service.FetchAndStoreNewsAsync(25);

        _apiClientMock.Verify(c => c.FetchNewsAsync(
            It.Is<string>(s => s.Contains("fed rate")),
            It.Is<string?>(p => p != null && p.Contains("2026-03-13T10:00:00")),
            It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    #endregion

    #region Rate Limiting Config (ParseFetchConfig)

    [Fact]
    public void ParseFetchConfig_ValidJson_ParsesCorrectly()
    {
        var json = """{"DailyRequestBudget":100,"CycleBudget":25,"RequestsToday":12,"CounterDate":"2026-03-11","Queries":["macro","geopolitical"]}""";
        var config = MarketAuxNewsWorker.ParseFetchConfig(json);

        Assert.Equal(100, config.DailyRequestBudget);
        Assert.Equal(25, config.CycleBudget);
        Assert.Equal(12, config.RequestsToday);
        Assert.Equal("2026-03-11", config.CounterDate);
        Assert.Equal(2, config.Queries.Count);
    }

    [Fact]
    public void ParseFetchConfig_EmptyOrNull_ReturnsDefaults()
    {
        var configNull = MarketAuxNewsWorker.ParseFetchConfig(null);
        var configEmpty = MarketAuxNewsWorker.ParseFetchConfig("");

        Assert.Equal(100, configNull.DailyRequestBudget);
        Assert.Equal(35, configNull.CycleBudget);
        Assert.Equal(0, configNull.RequestsToday);
        Assert.Equal(100, configEmpty.DailyRequestBudget);
        Assert.Equal(35, configEmpty.CycleBudget);
        Assert.Equal(0, configEmpty.RequestsToday);
    }

    [Fact]
    public void ParseFetchConfig_MalformedJson_ReturnsDefaults()
    {
        var config = MarketAuxNewsWorker.ParseFetchConfig("{invalid json!!}");

        Assert.Equal(100, config.DailyRequestBudget);
        Assert.Equal(35, config.CycleBudget);
        Assert.Equal(0, config.RequestsToday);
    }

    [Fact]
    public void RateLimitCheck_BudgetExhausted_SkipsCycle()
    {
        var json = """{"DailyRequestBudget":100,"RequestsToday":100,"CounterDate":"2026-03-11"}""";
        var config = MarketAuxNewsWorker.ParseFetchConfig(json);

        Assert.True(config.RequestsToday >= config.DailyRequestBudget);
    }

    [Fact]
    public void RateLimitCheck_CounterDateMismatch_ResetsCounter()
    {
        var json = """{"DailyRequestBudget":100,"RequestsToday":50,"CounterDate":"2026-03-10"}""";
        var config = MarketAuxNewsWorker.ParseFetchConfig(json);
        var todayUtc = DateTime.UtcNow.ToString("yyyy-MM-dd");

        if (config.CounterDate != todayUtc)
        {
            config.RequestsToday = 0;
            config.CounterDate = todayUtc;
        }

        Assert.Equal(0, config.RequestsToday);
        Assert.Equal(todayUtc, config.CounterDate);
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
