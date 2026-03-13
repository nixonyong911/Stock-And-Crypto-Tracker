using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.LocalIndicators;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class LocalIndicatorWorkerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<ILocalIndicatorCalculatorService> _calculatorMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private LocalIndicatorWorker CreateWorker()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IFetchScheduleRepository)))
            .Returns(_scheduleRepoMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(ILocalIndicatorCalculatorService)))
            .Returns(_calculatorMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);

        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        return new LocalIndicatorWorker(
            _serviceProviderMock.Object,
            Mock.Of<ILogger<LocalIndicatorWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_NoSchedule_DoesNotCrash()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Local Indicator Computation"))
            .ReturnsAsync((FetchSchedule?)null);
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("LocalCompute"))
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
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Local Indicator Computation"))
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
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Local Indicator Computation"))
            .ReturnsAsync((FetchSchedule?)null);
        _scheduleRepoMock.Setup(r => r.GetScheduleByDataSourceNameAsync("LocalCompute"))
            .ReturnsAsync(new FetchSchedule { Id = 1, IsEnabled = false });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
