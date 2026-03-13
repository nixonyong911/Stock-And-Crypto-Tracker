using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Massive;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class MassiveFetchWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<IStockTickerRepository> _tickerRepoMock = new();
    private readonly Mock<ICryptoTickerRepository> _cryptoTickerRepoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private MassiveFetchWorker CreateWorker()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IStockTickerRepository)))
            .Returns(_tickerRepoMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(ICryptoTickerRepository)))
            .Returns(_cryptoTickerRepoMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);

        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        var rabbitSettings = Options.Create(new RabbitMQSettings());

        return new MassiveFetchWorker(
            _serviceProviderMock.Object,
            rabbitSettings,
            Mock.Of<ILogger<MassiveFetchWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_NoSchedule_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("Massive"))
            .ReturnsAsync((FetchSchedule?)null);

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_DisabledSchedule_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("Massive"))
            .ReturnsAsync(new FetchSchedule { Id = 1, IsEnabled = false });

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
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("Massive"))
            .ThrowsAsync(new InvalidOperationException("DB down"));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
