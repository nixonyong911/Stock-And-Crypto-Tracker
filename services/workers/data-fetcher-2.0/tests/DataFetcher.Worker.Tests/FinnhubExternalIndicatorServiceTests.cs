using System.Data;
using System.Net;
using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubExternalIndicatorServiceTests
{
    private readonly Mock<IFinnhubApiClient> _finnhubClientMock = new();
    private readonly Mock<IStockTickerRepository> _stockTickerRepoMock = new();
    private readonly Mock<IStockIndicatorAdvancedRepository> _stockAdvancedRepoMock = new();
    private readonly Mock<IInsiderTradingRepository> _insiderTradingRepoMock = new();
    private readonly Mock<IDbConnectionFactory> _dbFactoryMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private TestableFinnhubExternalIndicatorService CreateService()
    {
        var mockConnection = new Mock<IDbConnection>();
        _dbFactoryMock.Setup(f => f.CreateConnection()).Returns(mockConnection.Object);

        return new TestableFinnhubExternalIndicatorService(
            _finnhubClientMock.Object,
            _stockTickerRepoMock.Object,
            _stockAdvancedRepoMock.Object,
            _insiderTradingRepoMock.Object,
            _dbFactoryMock.Object,
            _metricsMock.Object,
            Mock.Of<ILogger<FinnhubExternalIndicatorService>>());
    }

    private void SetupDefaultFinnhubResponses(string symbol)
    {
        _finnhubClientMock.Setup(c => c.GetInsiderTransactionsAsync(symbol, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderTransactionsResponse
            {
                Symbol = symbol,
                Data = new List<InsiderTransaction>
                {
                    new() { TransactionCode = "P", Change = 1000, TransactionPrice = 150m,
                        TransactionDate = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd"), IsDerivative = false },
                    new() { TransactionCode = "S", Change = -500, TransactionPrice = 155m,
                        TransactionDate = DateTime.UtcNow.AddDays(-20).ToString("yyyy-MM-dd"), IsDerivative = false }
                }
            });

        _finnhubClientMock.Setup(c => c.GetInsiderSentimentAsync(symbol, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderSentimentResponse
            {
                Symbol = symbol,
                Data = new List<InsiderSentimentData>
                {
                    new() { Year = 2026, Month = 3, Mspr = 25.5m, Change = 5000 }
                }
            });

        _finnhubClientMock.Setup(c => c.GetRecommendationTrendsAsync(symbol, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RecommendationTrend>
            {
                new() { Period = "2026-03-01", StrongBuy = 10, Buy = 20, Hold = 15, Sell = 3, StrongSell = 1 }
            });
    }

    // ================================================================
    // Test 1: FetchAll iterates all active tickers and writes to repo
    // ================================================================

    [Fact]
    public async Task FetchAll_IteratesAllActiveTickers_WritesToRepo()
    {
        var tickers = new List<StockTicker>
        {
            new() { Id = 1, Symbol = "AAPL", IsActive = true },
            new() { Id = 2, Symbol = "MSFT", IsActive = true }
        };
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);
        SetupDefaultFinnhubResponses("AAPL");
        SetupDefaultFinnhubResponses("MSFT");

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.Equal(2, result.TotalTickers);
        Assert.Equal(2, result.SuccessCount);
        Assert.Equal(0, result.FailedCount);
        _stockAdvancedRepoMock.Verify(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()), Times.Exactly(2));
    }

    // ================================================================
    // Test 2: One ticker fails, others continue
    // ================================================================

    [Fact]
    public async Task FetchAll_OneTickerFails_ContinuesOthers()
    {
        var tickers = new List<StockTicker>
        {
            new() { Id = 1, Symbol = "AAPL", IsActive = true },
            new() { Id = 2, Symbol = "BAD",  IsActive = true },
            new() { Id = 3, Symbol = "GOOG", IsActive = true }
        };
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);
        SetupDefaultFinnhubResponses("AAPL");
        SetupDefaultFinnhubResponses("GOOG");

        // Simulate a hard failure: repo write throws for "BAD"
        _finnhubClientMock.Setup(c => c.GetInsiderTransactionsAsync("BAD", It.IsAny<CancellationToken>()))
            .ReturnsAsync((InsiderTransactionsResponse?)null);
        _finnhubClientMock.Setup(c => c.GetInsiderSentimentAsync("BAD", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((InsiderSentimentResponse?)null);
        _finnhubClientMock.Setup(c => c.GetRecommendationTrendsAsync("BAD", It.IsAny<CancellationToken>()))
            .ReturnsAsync((List<RecommendationTrend>?)null);

        var callCount = 0;
        _stockAdvancedRepoMock.Setup(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()))
            .Callback<IEnumerable<StockIndicatorAdvanced>>(entities =>
            {
                callCount++;
                var entity = entities.First();
                if (entity.StockTickerId == 2)
                    throw new InvalidOperationException("DB write failed for BAD");
            });

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.Equal(3, result.TotalTickers);
        Assert.Equal(2, result.SuccessCount);
        Assert.Equal(1, result.FailedCount);
        Assert.Equal(3, callCount);
    }

    // ================================================================
    // Test 3: Cancellation token stops processing
    // ================================================================

    [Fact]
    public async Task FetchAll_CancellationToken_StopsProcessing()
    {
        var tickers = Enumerable.Range(1, 10).Select(i => new StockTicker
        {
            Id = i, Symbol = $"TICK{i}", IsActive = true
        }).ToList();
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync(cts.Token);

        Assert.Equal(10, result.TotalTickers);
        Assert.Equal(0, result.SuccessCount);
    }

    // ================================================================
    // Test 4: Empty tickers returns zero
    // ================================================================

    [Fact]
    public async Task FetchAll_EmptyTickers_ReturnsZero()
    {
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(Enumerable.Empty<StockTicker>());

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.Equal(0, result.TotalTickers);
        Assert.Equal(0, result.SuccessCount);
        Assert.Equal(0, result.FailedCount);
        Assert.True(result.Success);
    }

    // ================================================================
    // Test 5: Single ticker — all endpoints succeed, verify entity
    // ================================================================

    [Fact]
    public async Task FetchSingle_AllEndpointsSucceed_WritesCorrectEntity()
    {
        SetupDefaultFinnhubResponses("AAPL");
        StockIndicatorAdvanced? captured = null;
        _stockAdvancedRepoMock.Setup(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()))
            .Callback<IEnumerable<StockIndicatorAdvanced>>(entities => captured = entities.First());

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.True(success);
        Assert.NotNull(captured);
        Assert.Equal(1, captured!.StockTickerId);
        Assert.Equal(42, captured.DataSourceId);
        Assert.Equal(1, captured.InsiderBuyCount);
        Assert.Equal(1, captured.InsiderSellCount);
        Assert.Equal(25.5m, captured.InsiderMspr);
        Assert.Equal(5000, captured.InsiderMsprChange);
        Assert.Equal(10, captured.AnalystStrongBuy);
        Assert.Equal(20, captured.AnalystBuy);
        Assert.Equal(15, captured.AnalystHold);
        Assert.Equal(3, captured.AnalystSell);
        Assert.Equal(1, captured.AnalystStrongSell);
        Assert.Equal("buy", captured.AnalystConsensus);
        Assert.Null(captured.BollingerUpper);
        Assert.Null(captured.Atr);
    }

    // ================================================================
    // Test 6: Timeout on one endpoint writes partial data
    // ================================================================

    [Fact]
    public async Task FetchSingle_TimeoutOnOneEndpoint_StillWritesPartialData()
    {
        _finnhubClientMock.Setup(c => c.GetInsiderTransactionsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderTransactionsResponse
            {
                Symbol = "AAPL",
                Data = new List<InsiderTransaction>
                {
                    new() { TransactionCode = "P", Change = 500, TransactionPrice = 100m,
                        TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = false }
                }
            });

        _finnhubClientMock.Setup(c => c.GetInsiderSentimentAsync("AAPL", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TaskCanceledException("timeout", new TimeoutException()));

        _finnhubClientMock.Setup(c => c.GetRecommendationTrendsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RecommendationTrend>
            {
                new() { Period = "2026-03-01", StrongBuy = 5, Buy = 10, Hold = 8, Sell = 2, StrongSell = 0 }
            });

        StockIndicatorAdvanced? captured = null;
        _stockAdvancedRepoMock.Setup(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()))
            .Callback<IEnumerable<StockIndicatorAdvanced>>(entities => captured = entities.First());

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.True(success);
        Assert.NotNull(captured);
        Assert.Equal(1, captured!.InsiderBuyCount);
        Assert.Null(captured.InsiderMspr);
        Assert.Null(captured.InsiderMsprChange);
        Assert.Equal(5, captured.AnalystStrongBuy);
    }

    // ================================================================
    // Test 7: Permanent 403 on all endpoints still returns true (writes nulls)
    // ================================================================

    [Fact]
    public async Task FetchSingle_Permanent403_SkipsGracefully()
    {
        var forbidden = new HttpRequestException("Forbidden", null, HttpStatusCode.Forbidden);
        _finnhubClientMock.Setup(c => c.GetInsiderTransactionsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ThrowsAsync(forbidden);
        _finnhubClientMock.Setup(c => c.GetInsiderSentimentAsync("AAPL", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(forbidden);
        _finnhubClientMock.Setup(c => c.GetRecommendationTrendsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ThrowsAsync(forbidden);

        StockIndicatorAdvanced? captured = null;
        _stockAdvancedRepoMock.Setup(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()))
            .Callback<IEnumerable<StockIndicatorAdvanced>>(entities => captured = entities.First());

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.True(success);
        Assert.NotNull(captured);
        Assert.Equal(0, captured!.InsiderBuyCount);
        Assert.Null(captured.InsiderMspr);
        Assert.Null(captured.AnalystConsensus);
    }

    // ================================================================
    // Test 8: FetchAll reports duration > 0
    // ================================================================

    [Fact]
    public async Task FetchAll_ReportsDuration()
    {
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(Enumerable.Empty<StockTicker>());

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.True(result.DurationSeconds >= 0);
    }

    // ================================================================
    // Test 9: DeriveConsensus all strong sell
    // ================================================================

    [Fact]
    public void DeriveConsensus_AllStrongSell_ReturnsStrongSell()
    {
        var result = FinnhubExternalIndicatorService.DeriveConsensus(0, 0, 0, 1, 30);
        Assert.Equal("strong_sell", result);
    }

    // ================================================================
    // Test 10: ExecuteWithRetry all retries exhausted returns null
    // ================================================================

    [Fact]
    public async Task ExecuteWithRetry_AllRetriesExhausted_ReturnsNull()
    {
        var callCount = 0;
        var zeroDelays = new[] { TimeSpan.Zero, TimeSpan.Zero, TimeSpan.Zero };

        var result = await FinnhubResiliencePolicies.ExecuteWithRetryAsync<string>(
            () =>
            {
                callCount++;
                throw new HttpRequestException("error", null, HttpStatusCode.InternalServerError);
            },
            3, NullLogger.Instance, "test", CancellationToken.None, zeroDelays);

        Assert.Null(result);
        Assert.Equal(4, callCount); // 1 initial + 3 retries
    }

    // ================================================================
    // Test 11: FetchSingle stores raw insider transactions alongside aggregation
    // ================================================================

    [Fact]
    public async Task FetchSingle_StoresRawTransactions_AlongsideAggregation()
    {
        SetupDefaultFinnhubResponses("AAPL");

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.True(success);
        _stockAdvancedRepoMock.Verify(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()), Times.Once);
        _insiderTradingRepoMock.Verify(r => r.BulkUpsertAsync(1, "AAPL", It.Is<List<InsiderTransaction>>(l => l.Count == 2)), Times.Once);
    }

    // ================================================================
    // Test 12: FetchSingle with null insider data skips raw storage
    // ================================================================

    [Fact]
    public async Task FetchSingle_NullInsiderData_SkipsRawStorage()
    {
        _finnhubClientMock.Setup(c => c.GetInsiderTransactionsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ReturnsAsync((InsiderTransactionsResponse?)null);
        _finnhubClientMock.Setup(c => c.GetInsiderSentimentAsync("AAPL", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((InsiderSentimentResponse?)null);
        _finnhubClientMock.Setup(c => c.GetRecommendationTrendsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ReturnsAsync((List<RecommendationTrend>?)null);

        var service = CreateService();
        await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        _insiderTradingRepoMock.Verify(r => r.BulkUpsertAsync(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<List<InsiderTransaction>>()), Times.Never);
    }

    // ================================================================
    // Test 13: FetchSingle with empty insider data skips raw storage
    // ================================================================

    [Fact]
    public async Task FetchSingle_EmptyInsiderData_SkipsRawStorage()
    {
        _finnhubClientMock.Setup(c => c.GetInsiderTransactionsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderTransactionsResponse { Symbol = "AAPL", Data = new List<InsiderTransaction>() });
        _finnhubClientMock.Setup(c => c.GetInsiderSentimentAsync("AAPL", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((InsiderSentimentResponse?)null);
        _finnhubClientMock.Setup(c => c.GetRecommendationTrendsAsync("AAPL", It.IsAny<CancellationToken>()))
            .ReturnsAsync((List<RecommendationTrend>?)null);

        var service = CreateService();
        await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        _insiderTradingRepoMock.Verify(r => r.BulkUpsertAsync(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<List<InsiderTransaction>>()), Times.Never);
    }

    // ================================================================
    // Test 14: FetchAll calls cleanup after all tickers
    // ================================================================

    [Fact]
    public async Task FetchAll_CallsCleanupAfterAllTickers()
    {
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(new List<StockTicker> { new() { Id = 1, Symbol = "AAPL", IsActive = true } });
        SetupDefaultFinnhubResponses("AAPL");

        var service = CreateService();
        await service.FetchAllStockExternalIndicatorsAsync();

        _insiderTradingRepoMock.Verify(r => r.CleanupOldTransactionsAsync(90), Times.Once);
    }

    // ================================================================
    // Test 15: Raw storage failure does not prevent aggregation
    // ================================================================

    [Fact]
    public async Task FetchSingle_RawStorageFails_AggregationStillSucceeds()
    {
        SetupDefaultFinnhubResponses("AAPL");
        _insiderTradingRepoMock.Setup(r => r.BulkUpsertAsync(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<List<InsiderTransaction>>()))
            .ThrowsAsync(new InvalidOperationException("DB error"));

        StockIndicatorAdvanced? captured = null;
        _stockAdvancedRepoMock.Setup(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()))
            .Callback<IEnumerable<StockIndicatorAdvanced>>(entities => captured = entities.First());

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.True(success);
        Assert.NotNull(captured);
        Assert.Equal(1, captured!.InsiderBuyCount);
    }

    // ================================================================
    // Testable subclass that bypasses Dapper for GetFinnhubDataSourceIdAsync
    // ================================================================

    private class TestableFinnhubExternalIndicatorService : FinnhubExternalIndicatorService
    {
        public TestableFinnhubExternalIndicatorService(
            IFinnhubApiClient finnhubClient,
            IStockTickerRepository stockTickerRepo,
            IStockIndicatorAdvancedRepository stockAdvancedRepo,
            IInsiderTradingRepository insiderTradingRepo,
            IDbConnectionFactory dbConnectionFactory,
            IMetricsClient metrics,
            ILogger<FinnhubExternalIndicatorService> logger)
            : base(finnhubClient, stockTickerRepo, stockAdvancedRepo, insiderTradingRepo, dbConnectionFactory, metrics, logger)
        {
        }

        internal override Task<int> GetFinnhubDataSourceIdAsync() => Task.FromResult(42);
    }
}
