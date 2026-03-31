using System.Data;
using System.Data.Common;
using Xunit;
using Moq;
using Moq.Protected;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Etoro;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class EtoroSocialDataWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IEtoroMarketDataClient> _clientMock;
    private readonly Mock<IDbConnectionFactory> _dbFactoryMock;
    private readonly Mock<IDbConnection> _connectionMock;
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<EtoroSocialDataWorker>> _loggerMock;

    public EtoroSocialDataWorkerTests()
    {
        _serviceProviderMock = new Mock<IServiceProvider>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _clientMock = new Mock<IEtoroMarketDataClient>();
        _dbFactoryMock = new Mock<IDbConnectionFactory>();
        _connectionMock = new Mock<IDbConnection>();
        _scheduleRepoMock = new Mock<IFetchScheduleRepository>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<EtoroSocialDataWorker>>();

        SetupMockConnectionForDapper();
        _dbFactoryMock.Setup(f => f.CreateConnection()).Returns(_connectionMock.Object);

        var scopeMock = new Mock<IServiceScope>();
        scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);

        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        scopeFactoryMock.Setup(f => f.CreateScope()).Returns(scopeMock.Object);

        _serviceProviderMock.Setup(p => p.GetService(typeof(IServiceScopeFactory)))
            .Returns(scopeFactoryMock.Object);

        _scopedProviderMock.Setup(p => p.GetService(typeof(IEtoroMarketDataClient)))
            .Returns(_clientMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IDbConnectionFactory)))
            .Returns(_dbFactoryMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);

        SetupDefaultApiResponses();
    }

    private EtoroSocialDataWorker CreateWorker() =>
        new(_serviceProviderMock.Object,
            Options.Create(new EtoroSettings()),
            _loggerMock.Object,
            _metricsMock.Object);

    private void SetupMockConnectionForDapper()
    {
        var readerMock = new Mock<DbDataReader>();
        readerMock.Setup(r => r.ReadAsync(It.IsAny<CancellationToken>())).ReturnsAsync(false);
        readerMock.Setup(r => r.Read()).Returns(false);
        readerMock.Setup(r => r.FieldCount).Returns(0);
        readerMock.Setup(r => r.NextResultAsync(It.IsAny<CancellationToken>())).ReturnsAsync(false);
        readerMock.Setup(r => r.NextResult()).Returns(false);
        readerMock.Setup(r => r.HasRows).Returns(false);

        var cmdMock = new Mock<DbCommand>();
        cmdMock.SetupAllProperties();
        cmdMock.Protected().Setup<DbParameter>("CreateDbParameter")
            .Returns(new Mock<DbParameter>().Object);
        cmdMock.Protected().SetupGet<DbParameterCollection>("DbParameterCollection")
            .Returns(new Mock<DbParameterCollection>().Object);
        cmdMock.Protected()
            .Setup<Task<DbDataReader>>("ExecuteDbDataReaderAsync",
                ItExpr.IsAny<CommandBehavior>(), ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(readerMock.Object);
        cmdMock.Protected()
            .Setup<DbDataReader>("ExecuteDbDataReader", ItExpr.IsAny<CommandBehavior>())
            .Returns(readerMock.Object);

        _connectionMock.Setup(c => c.CreateCommand()).Returns(cmdMock.Object);
        _connectionMock.Setup(c => c.State).Returns(ConnectionState.Open);
    }

    private void SetupDefaultApiResponses()
    {
        _clientMock.Setup(c => c.SearchInstrumentsSortedAsync(
                It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroSocialSearchResponse());

        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroCuratedListsResponse?)null);

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroInvestorSearchResponse());

        _clientMock.Setup(c => c.GetUserPortfolioAsync(
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroUserPortfolioResponse?)null);

        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroSocialInstrument?)null);
    }

    #region Worker Lifecycle

    [Fact]
    public async Task StartStop_WorkerStopsGracefully()
    {
        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(200);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task Cancellation_WorkerExitsWithoutException()
    {
        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    #endregion

    #region Phase A: Instrument Discovery

    [Fact]
    public async Task FetchInstruments_ReturnsData_WhenApiReturnsInstruments()
    {
        var page1 = new EtoroSocialSearchResponse
        {
            Items = [
                new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "Bitcoin", HoldingPct = 28.5 },
                new EtoroSocialInstrument { InstrumentId = 2, DisplayName = "Ethereum", HoldingPct = 16.2 }
            ]
        };
        var page2 = new EtoroSocialSearchResponse { Items = [] };

        _clientMock.SetupSequence(c => c.SearchInstrumentsSortedAsync(
                It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page1)
            .ReturnsAsync(page2);

        var worker = CreateWorker();
        var result = await worker.FetchInstrumentsAsync(_clientMock.Object, CancellationToken.None);

        Assert.Equal(2, result.Count);
        Assert.Equal("Bitcoin", result[0].DisplayName);
        Assert.Equal(28.5, result[0].HoldingPct);
    }

    [Fact]
    public async Task FetchInstruments_ReturnsEmpty_WhenApiReturnsNoItems()
    {
        _clientMock.Setup(c => c.SearchInstrumentsSortedAsync(
                It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroSocialSearchResponse());

        var worker = CreateWorker();
        var result = await worker.FetchInstrumentsAsync(_clientMock.Object, CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task FetchInstruments_ReturnsPartialData_WhenApiThrowsMidway()
    {
        var page1 = new EtoroSocialSearchResponse
        {
            Items = [new EtoroSocialInstrument { InstrumentId = 1 }]
        };

        _clientMock.SetupSequence(c => c.SearchInstrumentsSortedAsync(
                It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page1)
            .ThrowsAsync(new HttpRequestException("API down"));

        var worker = CreateWorker();
        var result = await worker.FetchInstrumentsAsync(_clientMock.Object, CancellationToken.None);

        Assert.Single(result);
    }

    [Fact]
    public async Task FetchInstruments_PropagatesCancellation()
    {
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        var worker = CreateWorker();
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => worker.FetchInstrumentsAsync(_clientMock.Object, cts.Token));
    }

    #endregion

    #region Phase B: Curated Lists

    [Fact]
    public async Task FetchCuratedLists_ReturnsData_WhenApiReturnsLists()
    {
        var response = new EtoroCuratedListsResponse
        {
            CuratedLists =
            [
                new EtoroCuratedList
                {
                    Name = "AI Revolution",
                    Items = [new EtoroCuratedListItem { InstrumentId = 100 }, new EtoroCuratedListItem { InstrumentId = 200 }]
                }
            ]
        };

        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(response);

        var worker = CreateWorker();
        var (lists, ids) = await worker.FetchCuratedListsAsync(_clientMock.Object, CancellationToken.None);

        Assert.NotNull(lists);
        Assert.Single(lists!.CuratedLists);
        Assert.Equal(2, ids.Count);
        Assert.Contains(100, ids);
        Assert.Contains(200, ids);
    }

    [Fact]
    public async Task FetchCuratedLists_ReturnsEmpty_WhenApiReturnsNull()
    {
        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroCuratedListsResponse?)null);

        var worker = CreateWorker();
        var (lists, ids) = await worker.FetchCuratedListsAsync(_clientMock.Object, CancellationToken.None);

        Assert.Null(lists);
        Assert.Empty(ids);
    }

    [Fact]
    public async Task FetchCuratedLists_ReturnsEmpty_WhenApiThrows()
    {
        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("API down"));

        var worker = CreateWorker();
        var (lists, ids) = await worker.FetchCuratedListsAsync(_clientMock.Object, CancellationToken.None);

        Assert.Null(lists);
        Assert.Empty(ids);
    }

    #endregion

    #region Phase C+D: Investor Portfolios

    [Fact]
    public async Task FetchInvestorPortfolios_ReturnsAggregated_WhenDataAvailable()
    {
        var investors = new EtoroInvestorSearchResponse
        {
            Items = [new EtoroInvestor { UserName = "trader1", Copiers = 5000, Gain = 25.0 }]
        };
        var portfolio = new EtoroUserPortfolioResponse
        {
            Positions =
            [
                new EtoroPosition { InstrumentId = 1, IsBuy = true, InvestmentPct = 10.0, NetProfit = 5.0 },
                new EtoroPosition { InstrumentId = 1, IsBuy = true, InvestmentPct = 5.0, NetProfit = 3.0 },
                new EtoroPosition { InstrumentId = 2, IsBuy = false, InvestmentPct = 2.0, NetProfit = -1.0 }
            ]
        };

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);
        _clientMock.Setup(c => c.GetUserPortfolioAsync("trader1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(portfolio);

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Equal(2, result.Count);

        var buyPosition = result.First(p => p.IsBuy);
        Assert.Equal(1, buyPosition.InstrumentId);
        Assert.Equal(2, buyPosition.NumPositions);
        Assert.Equal(15.0, buyPosition.TotalInvestmentPct);
        Assert.Equal(4.0, buyPosition.AvgNetProfit);

        var sellPosition = result.First(p => !p.IsBuy);
        Assert.Equal(2, sellPosition.InstrumentId);
        Assert.Equal(1, sellPosition.NumPositions);
    }

    [Fact]
    public async Task FetchInvestorPortfolios_SkipsFailedPortfolios_ContinuesWithOthers()
    {
        var investors = new EtoroInvestorSearchResponse
        {
            Items =
            [
                new EtoroInvestor { UserName = "failing_trader" },
                new EtoroInvestor { UserName = "good_trader" }
            ]
        };

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);
        _clientMock.Setup(c => c.GetUserPortfolioAsync("failing_trader", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Not found"));
        _clientMock.Setup(c => c.GetUserPortfolioAsync("good_trader", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroUserPortfolioResponse
            {
                Positions = [new EtoroPosition { InstrumentId = 1, IsBuy = true, InvestmentPct = 5.0, NetProfit = 1.0 }]
            });

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Single(result);
        Assert.Equal("good_trader", result[0].Username);
    }

    [Fact]
    public async Task FetchInvestorPortfolios_AbortsAfterConsecutiveFailures()
    {
        var investors = new EtoroInvestorSearchResponse
        {
            Items = Enumerable.Range(1, 15)
                .Select(i => new EtoroInvestor { UserName = $"trader{i}" })
                .ToList()
        };

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);
        _clientMock.Setup(c => c.GetUserPortfolioAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Auth failure"));

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Empty(result);
        _clientMock.Verify(c => c.GetUserPortfolioAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Exactly(EtoroSocialDataWorker.MaxConsecutivePortfolioFailures));
    }

    [Fact]
    public async Task FetchInvestorPortfolios_ResetsFailureCount_OnSuccess()
    {
        var investors = new EtoroInvestorSearchResponse
        {
            Items =
            [
                new EtoroInvestor { UserName = "fail1" },
                new EtoroInvestor { UserName = "fail2" },
                new EtoroInvestor { UserName = "success" },
                new EtoroInvestor { UserName = "fail3" },
                new EtoroInvestor { UserName = "fail4" },
            ]
        };

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);
        _clientMock.Setup(c => c.GetUserPortfolioAsync("fail1", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException());
        _clientMock.Setup(c => c.GetUserPortfolioAsync("fail2", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException());
        _clientMock.Setup(c => c.GetUserPortfolioAsync("success", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroUserPortfolioResponse
            {
                Positions = [new EtoroPosition { InstrumentId = 1, IsBuy = true, InvestmentPct = 1.0, NetProfit = 0.5 }]
            });
        _clientMock.Setup(c => c.GetUserPortfolioAsync("fail3", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException());
        _clientMock.Setup(c => c.GetUserPortfolioAsync("fail4", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException());

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Single(result);
        _clientMock.Verify(c => c.GetUserPortfolioAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Exactly(5));
    }

    [Fact]
    public async Task FetchInvestorPortfolios_ReturnsEmpty_WhenInvestorSearchFails()
    {
        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Service unavailable"));

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task FetchInvestorPortfolios_HandlesNullPortfolio()
    {
        var investors = new EtoroInvestorSearchResponse
        {
            Items = [new EtoroInvestor { UserName = "private_trader" }]
        };

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);
        _clientMock.Setup(c => c.GetUserPortfolioAsync("private_trader", It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroUserPortfolioResponse?)null);

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task FetchInvestorPortfolios_HandlesEmptyPortfolio()
    {
        var investors = new EtoroInvestorSearchResponse
        {
            Items = [new EtoroInvestor { UserName = "empty_trader" }]
        };

        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);
        _clientMock.Setup(c => c.GetUserPortfolioAsync("empty_trader", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroUserPortfolioResponse { Positions = [] });

        var worker = CreateWorker();
        var result = await worker.FetchInvestorPortfoliosAsync(_clientMock.Object, CancellationToken.None);

        Assert.Empty(result);
    }

    #endregion

    #region Position Aggregation

    [Fact]
    public void AggregatePositions_GroupsByInstrumentAndDirection()
    {
        var investor = new EtoroInvestor { UserName = "test", Copiers = 1000, Gain = 20.0, WinRatio = 75, RiskScore = 4 };
        var positions = new List<EtoroPosition>
        {
            new() { InstrumentId = 1, IsBuy = true, InvestmentPct = 10.0, NetProfit = 5.0 },
            new() { InstrumentId = 1, IsBuy = true, InvestmentPct = 8.0, NetProfit = 3.0 },
            new() { InstrumentId = 1, IsBuy = false, InvestmentPct = 2.0, NetProfit = -1.0 },
            new() { InstrumentId = 2, IsBuy = true, InvestmentPct = 15.0, NetProfit = 10.0 }
        };

        var result = EtoroSocialDataWorker.AggregatePositions(investor, positions);

        Assert.Equal(3, result.Count);

        var buy1 = result.Single(p => p.InstrumentId == 1 && p.IsBuy);
        Assert.Equal(2, buy1.NumPositions);
        Assert.Equal(18.0, buy1.TotalInvestmentPct);
        Assert.Equal(4.0, buy1.AvgNetProfit);

        var sell1 = result.Single(p => p.InstrumentId == 1 && !p.IsBuy);
        Assert.Equal(1, sell1.NumPositions);
        Assert.Equal(2.0, sell1.TotalInvestmentPct);
        Assert.Equal(-1.0, sell1.AvgNetProfit);

        var buy2 = result.Single(p => p.InstrumentId == 2);
        Assert.Equal(1, buy2.NumPositions);
        Assert.Equal(15.0, buy2.TotalInvestmentPct);
        Assert.Equal(10.0, buy2.AvgNetProfit);
    }

    [Fact]
    public void AggregatePositions_CopiesInvestorMetadata()
    {
        var investor = new EtoroInvestor
        {
            UserName = "top_trader", Copiers = 50000, Gain = 120.5,
            WinRatio = 82.3, RiskScore = 3
        };
        var positions = new List<EtoroPosition>
        {
            new() { InstrumentId = 1, IsBuy = true, InvestmentPct = 5.0, NetProfit = 2.0 }
        };

        var result = EtoroSocialDataWorker.AggregatePositions(investor, positions);

        Assert.Single(result);
        Assert.Equal("top_trader", result[0].Username);
        Assert.Equal(50000, result[0].Copiers);
        Assert.Equal(120.5, result[0].Gain);
        Assert.Equal(82.3, result[0].WinRatio);
        Assert.Equal(3, result[0].RiskScore);
    }

    [Fact]
    public void AggregatePositions_HandlesEmptyPositions()
    {
        var investor = new EtoroInvestor { UserName = "empty" };
        var result = EtoroSocialDataWorker.AggregatePositions(investor, []);
        Assert.Empty(result);
    }

    [Fact]
    public void AggregatePositions_HandlesSinglePosition()
    {
        var investor = new EtoroInvestor { UserName = "single" };
        var positions = new List<EtoroPosition>
        {
            new() { InstrumentId = 42, IsBuy = true, InvestmentPct = 100.0, NetProfit = 50.0 }
        };

        var result = EtoroSocialDataWorker.AggregatePositions(investor, positions);

        Assert.Single(result);
        Assert.Equal(42, result[0].InstrumentId);
        Assert.Equal(1, result[0].NumPositions);
        Assert.Equal(100.0, result[0].TotalInvestmentPct);
        Assert.Equal(50.0, result[0].AvgNetProfit);
    }

    #endregion

    #region Phase Isolation (Fault Tolerance)

    [Fact]
    public async Task CollectSocialData_PhaseAFailure_DoesNotBlockPhaseB()
    {
        _clientMock.Setup(c => c.SearchInstrumentsSortedAsync(
                It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("API down"));

        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroCuratedListsResponse
            {
                CuratedLists = [new EtoroCuratedList { Name = "Test", Items = [new EtoroCuratedListItem { InstrumentId = 1 }] }]
            });

        var worker = CreateWorker();
        var stats = await worker.CollectSocialDataAsync(CancellationToken.None);

        _clientMock.Verify(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CollectSocialData_PhaseBFailure_DoesNotBlockPhaseCD()
    {
        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("API down"));

        var investors = new EtoroInvestorSearchResponse
        {
            Items = [new EtoroInvestor { UserName = "test_user" }]
        };
        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(investors);

        var worker = CreateWorker();
        var stats = await worker.CollectSocialDataAsync(CancellationToken.None);

        _clientMock.Verify(c => c.SearchTopInvestorsAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CollectSocialData_AllPhasesFail_ReturnsZeroStats()
    {
        _clientMock.Setup(c => c.SearchInstrumentsSortedAsync(
                It.IsAny<string>(), It.IsAny<int?>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Phase A down"));
        _clientMock.Setup(c => c.GetCuratedListsAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Phase B down"));
        _clientMock.Setup(c => c.SearchTopInvestorsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Phase C down"));

        var worker = CreateWorker();
        var stats = await worker.CollectSocialDataAsync(CancellationToken.None);

        Assert.Equal(0, stats.InstrumentRows);
        Assert.Equal(0, stats.InvestorRows);
        Assert.Equal(0, stats.CuratedRows);
        Assert.Equal(0, stats.LookupUpserts);
    }

    #endregion

    #region Schedule Tracking Fault Tolerance

    [Fact]
    public async Task ExecuteAsync_ScheduleRepoThrows_DoesNotCrashWorker()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync(It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("DB connection failed"));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_MetricsThrows_DoesNotCrashWorker()
    {
        _metricsMock.Setup(m => m.IncrementCounterAsync(
                It.IsAny<string>(), It.IsAny<double>(), It.IsAny<Dictionary<string, string>>()))
            .ThrowsAsync(new InvalidOperationException("Metrics unavailable"));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    #endregion

    #region Metrics and Status Reporting

    [Fact]
    public async Task CollectSocialData_EmptyResults_ReportsEmptyStatus()
    {
        var worker = CreateWorker();
        var stats = await worker.CollectSocialDataAsync(CancellationToken.None);

        Assert.Equal(0, stats.InstrumentRows);
        Assert.Equal(0, stats.InvestorRows);
        Assert.Equal(0, stats.CuratedRows);
    }

    #endregion

    #region Phase E: Enrichment

    [Fact]
    public async Task EnrichUnknown_CallsApiForUnknownIds()
    {
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroSocialInstrument { InstrumentId = 42, DisplayName = "Tesla", InternalSymbol = "TSLA" });

        var worker = CreateWorker();
        var map = new EtoroInstrumentMap();
        var unknowns = new HashSet<int> { 42 };

        var enriched = await worker.EnrichUnknownInstrumentsAsync(_clientMock.Object, map, unknowns, CancellationToken.None);

        Assert.Equal(1, enriched);
        Assert.True(map.TryGet(42, out var info));
        Assert.Equal("Tesla", info!.DisplayName);
        Assert.Equal("TSLA", info.InternalSymbol);
    }

    [Fact]
    public async Task EnrichUnknown_SkipsWhenApiReturnsNull()
    {
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroSocialInstrument?)null);

        var worker = CreateWorker();
        var map = new EtoroInstrumentMap();
        var unknowns = new HashSet<int> { 99 };

        var enriched = await worker.EnrichUnknownInstrumentsAsync(_clientMock.Object, map, unknowns, CancellationToken.None);

        Assert.Equal(0, enriched);
        Assert.False(map.Contains(99));
    }

    [Fact]
    public async Task EnrichUnknown_CapsAtMaxPerRun()
    {
        var largeSet = Enumerable.Range(1, 100).ToHashSet();
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((int id, CancellationToken _) =>
                new EtoroSocialInstrument { InstrumentId = id, DisplayName = $"Inst{id}" });

        var worker = CreateWorker();
        var map = new EtoroInstrumentMap();

        await worker.EnrichUnknownInstrumentsAsync(_clientMock.Object, map, largeSet, CancellationToken.None);

        _clientMock.Verify(c => c.LookupInstrumentByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Exactly(EtoroSocialDataWorker.MaxEnrichmentPerRun));
    }

    [Fact]
    public async Task EnrichUnknown_ContinuesAfterSingleFailure()
    {
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(1, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("API error"));
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroSocialInstrument { InstrumentId = 2, DisplayName = "Nvidia" });

        var worker = CreateWorker();
        var map = new EtoroInstrumentMap();
        var unknowns = new HashSet<int> { 1, 2 };

        var enriched = await worker.EnrichUnknownInstrumentsAsync(_clientMock.Object, map, unknowns, CancellationToken.None);

        Assert.Equal(1, enriched);
        Assert.True(map.Contains(2));
    }

    [Fact]
    public async Task EnrichUnknown_PropagatesCancellation()
    {
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        var worker = CreateWorker();
        var map = new EtoroInstrumentMap();
        var unknowns = new HashSet<int> { 1 };

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => worker.EnrichUnknownInstrumentsAsync(_clientMock.Object, map, unknowns, cts.Token));
    }

    #endregion

    #region EtoroInstrumentMap

    [Fact]
    public void Map_AddFromSearch_StoresInstrumentWithMetadata()
    {
        var map = new EtoroInstrumentMap();
        map.AddFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Bitcoin", InternalSymbol = "BTC"
        });

        Assert.True(map.TryGet(1, out var info));
        Assert.Equal("Bitcoin", info!.DisplayName);
        Assert.Equal("BTC", info.InternalSymbol);
        Assert.Equal(1, map.PendingCount);
    }

    [Fact]
    public void Map_AddFromSearch_SkipsNullDisplayName()
    {
        var map = new EtoroInstrumentMap();
        map.AddFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = null
        });

        Assert.False(map.Contains(1));
        Assert.Equal(0, map.PendingCount);
    }

    [Fact]
    public void Map_AddEnriched_StoresInstrument()
    {
        var map = new EtoroInstrumentMap();
        map.AddEnriched(42, "Tesla Inc", "TSLA");

        Assert.True(map.TryGet(42, out var info));
        Assert.Equal("Tesla Inc", info!.DisplayName);
        Assert.Equal("TSLA", info.InternalSymbol);
    }

    [Fact]
    public void Map_AddEnriched_SkipsNullDisplayName()
    {
        var map = new EtoroInstrumentMap();
        map.AddEnriched(42, null!, null);

        Assert.False(map.Contains(42));
    }

    [Fact]
    public void Map_FindUnknownIds_ReturnsIdsNotInMap()
    {
        var map = new EtoroInstrumentMap();
        map.AddFromSearch(new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "Known" });

        var positions = new List<EtoroSocialDataWorker.AggregatedPosition>
        {
            new() { InstrumentId = 1 },
            new() { InstrumentId = 2 },
            new() { InstrumentId = 3 }
        };
        var curatedIds = new HashSet<int> { 1, 4 };

        var unknowns = map.FindUnknownIds(positions, curatedIds);

        Assert.Equal(3, unknowns.Count);
        Assert.Contains(2, unknowns);
        Assert.Contains(3, unknowns);
        Assert.Contains(4, unknowns);
        Assert.DoesNotContain(1, unknowns);
    }

    [Fact]
    public void Map_FindUnknownIds_ReturnsEmpty_WhenAllKnown()
    {
        var map = new EtoroInstrumentMap();
        map.AddFromSearch(new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "A" });
        map.AddFromSearch(new EtoroSocialInstrument { InstrumentId = 2, DisplayName = "B" });

        var positions = new List<EtoroSocialDataWorker.AggregatedPosition>
        {
            new() { InstrumentId = 1 }
        };
        var curatedIds = new HashSet<int> { 2 };

        var unknowns = map.FindUnknownIds(positions, curatedIds);

        Assert.Empty(unknowns);
    }

    [Fact]
    public void Map_Clear_RemovesAllEntries()
    {
        var map = new EtoroInstrumentMap();
        map.AddFromSearch(new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "A" });
        map.AddEnriched(2, "B", "B");

        map.Clear();

        Assert.False(map.Contains(1));
        Assert.False(map.Contains(2));
        Assert.Equal(0, map.KnownCount);
        Assert.Equal(0, map.PendingCount);
    }

    [Fact]
    public void Map_Contains_ChecksBothKnownAndPending()
    {
        var map = new EtoroInstrumentMap();
        map.AddEnriched(5, "Pending Item", "PI");

        Assert.True(map.Contains(5));
        Assert.False(map.Contains(999));
    }

    #endregion
}
