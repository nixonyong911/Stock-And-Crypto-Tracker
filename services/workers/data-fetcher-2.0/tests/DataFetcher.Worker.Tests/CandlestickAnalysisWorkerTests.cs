using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.CandlestickAnalysis;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class CandlestickAnalysisWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<ICandlestickAnalysisService> _analysisServiceMock = new();
    private readonly Mock<ICryptoCandlestickAnalysisService> _cryptoAnalysisServiceMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private CandlestickAnalysisWorker CreateWorker()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(ICandlestickAnalysisService)))
            .Returns(_analysisServiceMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(ICryptoCandlestickAnalysisService)))
            .Returns(_cryptoAnalysisServiceMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);

        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        return new CandlestickAnalysisWorker(
            _serviceProviderMock.Object,
            Mock.Of<ILogger<CandlestickAnalysisWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_NoSchedule_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("CandlestickAnalysis"))
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
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("CandlestickAnalysis"))
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
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("CandlestickAnalysis"))
            .ReturnsAsync(new FetchSchedule { Id = 1, IsEnabled = false });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
