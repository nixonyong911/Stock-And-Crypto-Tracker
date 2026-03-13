using DataFetcher.Worker.Application.Providers.MarketAuxNews;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.MarketAuxNews;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class MarketAuxNewsWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<IMarketAuxNewsFetchService> _fetchServiceMock = new();
    private readonly Mock<INewsArticleRepository> _newsRepoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private MarketAuxNewsWorker CreateWorker()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IMarketAuxNewsFetchService)))
            .Returns(_fetchServiceMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(INewsArticleRepository)))
            .Returns(_newsRepoMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);

        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        return new MarketAuxNewsWorker(
            _serviceProviderMock.Object,
            Mock.Of<ILogger<MarketAuxNewsWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_NoSchedule_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("MarketAux"))
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
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("MarketAux"))
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
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("MarketAux"))
            .ReturnsAsync(new FetchSchedule { Id = 1, IsEnabled = false });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
