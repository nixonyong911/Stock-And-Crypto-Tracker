using Xunit;
using Moq;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Alpaca;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class AlpacaStockFetchWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IAlpacaStockFetchService> _fetchServiceMock;
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<IGatewayAlertNotifier> _alertNotifierMock;
    private readonly Mock<ILogger<AlpacaStockFetchWorker>> _loggerMock;
    private readonly AlpacaSettings _settings;

    public AlpacaStockFetchWorkerTests()
    {
        _serviceProviderMock = new Mock<IServiceProvider>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _fetchServiceMock = new Mock<IAlpacaStockFetchService>();
        _scheduleRepoMock = new Mock<IFetchScheduleRepository>();
        _metricsMock = new Mock<IMetricsClient>();
        _alertNotifierMock = new Mock<IGatewayAlertNotifier>();
        _loggerMock = new Mock<ILogger<AlpacaStockFetchWorker>>();
        _settings = new AlpacaSettings { FetchIntervalMinutes = 30 };

        var scopeMock = new Mock<IServiceScope>();
        scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);

        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        scopeFactoryMock.Setup(f => f.CreateScope()).Returns(scopeMock.Object);

        _serviceProviderMock.Setup(p => p.GetService(typeof(IServiceScopeFactory)))
            .Returns(scopeFactoryMock.Object);

        _scopedProviderMock.Setup(p => p.GetService(typeof(IAlpacaStockFetchService)))
            .Returns(_fetchServiceMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);

        _fetchServiceMock.Setup(s => s.FetchLatestStockDataAsync(It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(10);
        _alertNotifierMock.Setup(a => a.NotifyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    private AlpacaStockFetchWorker CreateWorker() =>
        new(_serviceProviderMock.Object, Options.Create(_settings),
            _loggerMock.Object, _metricsMock.Object, _alertNotifierMock.Object);

    [Fact]
    public async Task ExecuteAsync_FetchesOnFirstLoop_DoesNotCrash()
    {
        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));

        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_FetchThrows_DoesNotCrash()
    {
        _fetchServiceMock.Setup(s => s.FetchLatestStockDataAsync(It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("API timeout"));

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
