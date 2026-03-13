using Xunit;
using Moq;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Fred;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class FredFetchWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock;
    private readonly Mock<IFredFetchService> _fetchServiceMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<FredFetchWorker>> _loggerMock;

    public FredFetchWorkerTests()
    {
        _serviceProviderMock = new Mock<IServiceProvider>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _scheduleRepoMock = new Mock<IFetchScheduleRepository>();
        _fetchServiceMock = new Mock<IFredFetchService>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<FredFetchWorker>>();

        var scopeMock = new Mock<IServiceScope>();
        scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);

        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        scopeFactoryMock.Setup(f => f.CreateScope()).Returns(scopeMock.Object);

        _serviceProviderMock.Setup(p => p.GetService(typeof(IServiceScopeFactory)))
            .Returns(scopeFactoryMock.Object);

        _scopedProviderMock.Setup(p => p.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IFredFetchService)))
            .Returns(_fetchServiceMock.Object);
    }

    private FredFetchWorker CreateWorker() =>
        new(_serviceProviderMock.Object, _loggerMock.Object, _metricsMock.Object);

    [Fact]
    public async Task ExecuteAsync_NoScheduleFound_DoesNotCallFetchAndDoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("FRED Daily Macro Fetch"))
            .ReturnsAsync((Domain.Common.Entities.FetchSchedule?)null);

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));

        Assert.Null(ex);
        _fetchServiceMock.Verify(
            s => s.FetchAllIndicatorsAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_ScheduleRepoThrows_DoesNotCrash()
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
    public async Task ExecuteAsync_CancellationDuringWait_StopsGracefully()
    {
        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));

        Assert.Null(ex);
    }
}
