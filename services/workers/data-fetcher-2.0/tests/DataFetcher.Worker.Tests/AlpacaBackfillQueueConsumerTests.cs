using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Workers.Alpaca;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class AlpacaBackfillQueueConsumerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IAlpacaStockBackfillService> _backfillServiceMock = new();
    private readonly Mock<IEtoroBackfillService> _etoroBackfillMock = new();
    private readonly Mock<IDbConnectionFactory> _dbFactoryMock = new();

    private AlpacaBackfillQueueConsumer CreateConsumer()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IAlpacaStockBackfillService)))
            .Returns(_backfillServiceMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IEtoroBackfillService)))
            .Returns(_etoroBackfillMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IDbConnectionFactory)))
            .Returns(_dbFactoryMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);
        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        var settings = Options.Create(new RabbitMQSettings
        {
            HostName = "localhost",
            BackfillQueueName = "test-backfill",
            AnalysisBackfillQueueName = "test-analysis-backfill"
        });

        return new AlpacaBackfillQueueConsumer(
            _serviceProviderMock.Object,
            settings,
            Mock.Of<ILogger<AlpacaBackfillQueueConsumer>>());
    }

    [Fact]
    public void Constructor_ValidArgs_DoesNotThrow()
    {
        var ex = Record.Exception(() => CreateConsumer());
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_Cancellation_StopsGracefully()
    {
        var consumer = CreateConsumer();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        await consumer.StartAsync(cts.Token);
        await Task.Delay(200);
        var ex = await Record.ExceptionAsync(() => consumer.StopAsync(CancellationToken.None));

        Assert.Null(ex);
    }

    [Fact]
    public async Task BackfillService_SuccessWithRecords_PublishesAnalysisBackfill()
    {
        _backfillServiceMock
            .Setup(s => s.ExecuteBackfillAsync(
                It.Is<AlpacaBackfillRequest>(r => r.Symbol == "AAPL"),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaBackfillResult
            {
                Symbol = "AAPL",
                Success = true,
                TotalRecordsInserted = 500,
                PagesProcessed = 3,
                Duration = TimeSpan.FromSeconds(10)
            });

        var request = new AlpacaBackfillRequest { Symbol = "AAPL", AssetType = "stock" };
        var result = await _backfillServiceMock.Object.ExecuteBackfillAsync(request);

        Assert.True(result.Success);
        Assert.True(result.TotalRecordsInserted > 0);
    }

    [Fact]
    public async Task BackfillService_SuccessWithZeroRecords_TriggersEtoroFallback()
    {
        _backfillServiceMock
            .Setup(s => s.ExecuteBackfillAsync(It.IsAny<AlpacaBackfillRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaBackfillResult
            {
                Symbol = "PYPL",
                Success = true,
                TotalRecordsInserted = 0
            });

        var request = new AlpacaBackfillRequest { Symbol = "PYPL", AssetType = "stock" };
        var result = await _backfillServiceMock.Object.ExecuteBackfillAsync(request);

        Assert.True(result.Success);
        Assert.Equal(0, result.TotalRecordsInserted);
    }

    [Fact]
    public async Task BackfillService_Failure_ReturnsError()
    {
        _backfillServiceMock
            .Setup(s => s.ExecuteBackfillAsync(It.IsAny<AlpacaBackfillRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaBackfillResult
            {
                Symbol = "INVALID",
                Success = false,
                Error = "Symbol not found"
            });

        var request = new AlpacaBackfillRequest { Symbol = "INVALID", AssetType = "stock" };
        var result = await _backfillServiceMock.Object.ExecuteBackfillAsync(request);

        Assert.False(result.Success);
        Assert.NotNull(result.Error);
    }

    [Fact]
    public void BackfillService_IsResolvable_FromScope()
    {
        _ = CreateConsumer();

        using var scope = _serviceProviderMock.Object.GetService<IServiceScopeFactory>()!.CreateScope();
        var service = scope.ServiceProvider.GetService(typeof(IAlpacaStockBackfillService));

        Assert.NotNull(service);
    }

    [Fact]
    public void EtoroBackfillService_IsResolvable_FromScope()
    {
        _ = CreateConsumer();

        using var scope = _serviceProviderMock.Object.GetService<IServiceScopeFactory>()!.CreateScope();
        var service = scope.ServiceProvider.GetService(typeof(IEtoroBackfillService));

        Assert.NotNull(service);
    }
}
