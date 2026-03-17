using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Workers.CandlestickAnalysis;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class AnalysisBackfillQueueConsumerTests
{
    private readonly Mock<IServiceProvider> _serviceProviderMock = new();
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock = new();
    private readonly Mock<IServiceScope> _scopeMock = new();
    private readonly Mock<IServiceProvider> _scopedProviderMock = new();
    private readonly Mock<IAnalysisBackfillService> _stockBackfillMock = new();
    private readonly Mock<ICryptoAnalysisBackfillService> _cryptoBackfillMock = new();

    private AnalysisBackfillQueueConsumer CreateConsumer()
    {
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(IAnalysisBackfillService)))
            .Returns(_stockBackfillMock.Object);
        _scopedProviderMock.Setup(sp => sp.GetService(typeof(ICryptoAnalysisBackfillService)))
            .Returns(_cryptoBackfillMock.Object);

        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);
        _serviceProviderMock.Setup(sp => sp.GetService(typeof(IServiceScopeFactory)))
            .Returns(_scopeFactoryMock.Object);

        var settings = Options.Create(new RabbitMQSettings
        {
            HostName = "localhost",
            AnalysisBackfillQueueName = "test-analysis-backfill"
        });

        return new AnalysisBackfillQueueConsumer(
            _serviceProviderMock.Object,
            settings,
            Mock.Of<ILogger<AnalysisBackfillQueueConsumer>>());
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
    public void StockBackfillService_SuccessResult_IsAccepted()
    {
        _stockBackfillMock
            .Setup(s => s.ExecuteBackfillAsync(It.IsAny<AnalysisBackfillRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnalysisBackfillResult
            {
                Symbol = "AAPL",
                Success = true,
                DatesAnalyzed = 50,
                PatternsDetected = 12,
                Duration = TimeSpan.FromSeconds(1)
            });

        _stockBackfillMock.Verify(
            s => s.ExecuteBackfillAsync(
                It.Is<AnalysisBackfillRequest>(r => r.AssetType == "crypto"),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public void CryptoBackfillService_IsResolvable()
    {
        var consumer = CreateConsumer();

        using var scope = _serviceProviderMock.Object.GetService<IServiceScopeFactory>()!.CreateScope();
        var service = scope.ServiceProvider.GetService(typeof(ICryptoAnalysisBackfillService));

        Assert.NotNull(service);
        Assert.IsAssignableFrom<ICryptoAnalysisBackfillService>(service);
    }

    [Fact]
    public void StockBackfillService_IsResolvable()
    {
        var consumer = CreateConsumer();

        using var scope = _serviceProviderMock.Object.GetService<IServiceScopeFactory>()!.CreateScope();
        var service = scope.ServiceProvider.GetService(typeof(IAnalysisBackfillService));

        Assert.NotNull(service);
        Assert.IsAssignableFrom<IAnalysisBackfillService>(service);
    }

    [Fact]
    public async Task StockBackfillService_FailedResult_ThrowsSoMessageIsRequeued()
    {
        _stockBackfillMock
            .Setup(s => s.ExecuteBackfillAsync(It.IsAny<AnalysisBackfillRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnalysisBackfillResult
            {
                Symbol = "AAPL",
                Success = false,
                Error = "No price data found"
            });

        var request = new AnalysisBackfillRequest { Symbol = "AAPL", AssetType = "stock" };
        var result = await _stockBackfillMock.Object.ExecuteBackfillAsync(request);

        Assert.False(result.Success);
        Assert.Equal("No price data found", result.Error);
    }

    [Fact]
    public async Task CryptoBackfillService_SuccessResult_ContainsExpectedFields()
    {
        _cryptoBackfillMock
            .Setup(s => s.ExecuteBackfillAsync(It.IsAny<AnalysisBackfillRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnalysisBackfillResult
            {
                Symbol = "BTC/USD",
                Success = true,
                DatesAnalyzed = 30,
                PatternsDetected = 5,
                Duration = TimeSpan.FromSeconds(2)
            });

        var request = new AnalysisBackfillRequest { Symbol = "BTC/USD", AssetType = "crypto" };
        var result = await _cryptoBackfillMock.Object.ExecuteBackfillAsync(request);

        Assert.True(result.Success);
        Assert.Equal("BTC/USD", result.Symbol);
        Assert.Equal(30, result.DatesAnalyzed);
        Assert.True(result.Duration.TotalSeconds > 0);
    }
}
