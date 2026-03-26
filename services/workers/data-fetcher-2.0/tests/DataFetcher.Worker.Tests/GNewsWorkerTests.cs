using DataFetcher.Worker.Application.Providers.GNews;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.GNews;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class GNewsWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<IGNewsFetchService> _fetchServiceMock = new();
    private readonly Mock<IGNewsArticleRepository> _newsRepoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private GNewsWorker CreateWorker()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IGNewsFetchService)))
            .Returns(_fetchServiceMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IGNewsArticleRepository)))
            .Returns(_newsRepoMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);

        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        return new GNewsWorker(
            _serviceProviderMock.Object,
            Mock.Of<ILogger<GNewsWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_NoSchedule_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("GNews"))
            .ReturnsAsync((FetchSchedule?)null);

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_ServiceThrows_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("GNews"))
            .ThrowsAsync(new InvalidOperationException("DB down"));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_Cancellation_StopsGracefully()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("GNews"))
            .ReturnsAsync(new FetchSchedule { Id = 1, IsEnabled = false });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public void ParseFetchConfig_ValidJson_ReturnsConfig()
    {
        var json = """{"DailyRequestBudget": 90, "CycleBudget": 10, "RequestsToday": 5, "CounterDate": "2026-03-26", "Categories": ["general","world"]}""";
        var config = GNewsWorker.ParseFetchConfig(json);

        Assert.Equal(90, config.DailyRequestBudget);
        Assert.Equal(10, config.CycleBudget);
        Assert.Equal(5, config.RequestsToday);
        Assert.Equal("2026-03-26", config.CounterDate);
        Assert.Equal(2, config.Categories.Count);
        Assert.Contains("general", config.Categories);
        Assert.Contains("world", config.Categories);
    }

    [Fact]
    public void ParseFetchConfig_NullJson_ReturnsDefaults()
    {
        var config = GNewsWorker.ParseFetchConfig(null);

        Assert.Equal(90, config.DailyRequestBudget);
        Assert.Equal(10, config.CycleBudget);
        Assert.Equal(0, config.RequestsToday);
        Assert.Equal(3, config.Categories.Count);
    }

    [Fact]
    public void ParseFetchConfig_InvalidJson_ReturnsDefaults()
    {
        var config = GNewsWorker.ParseFetchConfig("not-json");

        Assert.Equal(90, config.DailyRequestBudget);
        Assert.Equal(10, config.CycleBudget);
    }
}
