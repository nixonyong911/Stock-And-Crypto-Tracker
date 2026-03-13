using Xunit;
using Moq;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Finnhub;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class FinnhubFetchWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock;
    private readonly Mock<IFundamentalsFetchService> _fundamentalsServiceMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<FinnhubFetchWorker>> _loggerMock;

    public FinnhubFetchWorkerTests()
    {
        _serviceProviderMock = new Mock<IServiceProvider>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _scheduleRepoMock = new Mock<IFetchScheduleRepository>();
        _fundamentalsServiceMock = new Mock<IFundamentalsFetchService>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<FinnhubFetchWorker>>();

        var scopeMock = new Mock<IServiceScope>();
        scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);

        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        scopeFactoryMock.Setup(f => f.CreateScope()).Returns(scopeMock.Object);

        _serviceProviderMock.Setup(p => p.GetService(typeof(IServiceScopeFactory)))
            .Returns(scopeFactoryMock.Object);

        _scopedProviderMock.Setup(p => p.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IFundamentalsFetchService)))
            .Returns(_fundamentalsServiceMock.Object);
    }

    private FinnhubFetchWorker CreateWorker() =>
        new(_serviceProviderMock.Object, _loggerMock.Object, _metricsMock.Object);

    [Fact]
    public async Task ExecuteAsync_NoScheduleFound_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("Finnhub"))
            .ReturnsAsync((Domain.Common.Entities.FetchSchedule?)null);

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));

        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_ScheduleRepoThrows_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync(It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("DB connection failed"));

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
