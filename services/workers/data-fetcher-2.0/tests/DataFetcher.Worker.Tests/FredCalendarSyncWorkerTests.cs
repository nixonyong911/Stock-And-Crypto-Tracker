using Xunit;
using Moq;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Workers.Fred;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class FredCalendarSyncWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IFredCalendarSyncService> _syncServiceMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<FredCalendarSyncWorker>> _loggerMock;

    public FredCalendarSyncWorkerTests()
    {
        _serviceProviderMock = new Mock<IServiceProvider>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _syncServiceMock = new Mock<IFredCalendarSyncService>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<FredCalendarSyncWorker>>();

        var scopeMock = new Mock<IServiceScope>();
        scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);

        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        scopeFactoryMock.Setup(f => f.CreateScope()).Returns(scopeMock.Object);

        _serviceProviderMock.Setup(p => p.GetService(typeof(IServiceScopeFactory)))
            .Returns(scopeFactoryMock.Object);

        _scopedProviderMock.Setup(p => p.GetService(typeof(IFredCalendarSyncService)))
            .Returns(_syncServiceMock.Object);

        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((1, 0));
    }

    private FredCalendarSyncWorker CreateWorker() =>
        new(_serviceProviderMock.Object, _loggerMock.Object, _metricsMock.Object);

    [Fact]
    public async Task ExecuteAsync_StartsAndRunsInitialSync_DoesNotCrash()
    {
        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));

        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_SyncThrows_DoesNotCrash()
    {
        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
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
