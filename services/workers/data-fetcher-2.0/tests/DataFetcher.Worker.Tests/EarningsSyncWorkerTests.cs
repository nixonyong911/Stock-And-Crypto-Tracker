using Xunit;
using Moq;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Scheduling;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Scheduling;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class EarningsSyncWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock;
    private readonly Mock<IEarningsSyncService> _earningsSyncServiceMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<EarningsSyncWorker>> _loggerMock;

    public EarningsSyncWorkerTests()
    {
        _serviceProviderMock = new Mock<IServiceProvider>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _scheduleRepoMock = new Mock<IFetchScheduleRepository>();
        _earningsSyncServiceMock = new Mock<IEarningsSyncService>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<EarningsSyncWorker>>();

        var scopeMock = new Mock<IServiceScope>();
        scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);

        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        scopeFactoryMock.Setup(f => f.CreateScope()).Returns(scopeMock.Object);

        _serviceProviderMock.Setup(p => p.GetService(typeof(IServiceScopeFactory)))
            .Returns(scopeFactoryMock.Object);

        _scopedProviderMock.Setup(p => p.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IEarningsSyncService)))
            .Returns(_earningsSyncServiceMock.Object);
    }

    private EarningsSyncWorker CreateWorker() =>
        new(_serviceProviderMock.Object, _loggerMock.Object, _metricsMock.Object);

    [Fact]
    public async Task ExecuteAsync_NoScheduleFound_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Monthly Earnings Sync"))
            .ReturnsAsync((Domain.Common.Entities.FetchSchedule?)null);

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
        _earningsSyncServiceMock.Setup(s => s.SyncAllTickersAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Sync failed"));

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
        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));

        Assert.Null(ex);
    }
}
