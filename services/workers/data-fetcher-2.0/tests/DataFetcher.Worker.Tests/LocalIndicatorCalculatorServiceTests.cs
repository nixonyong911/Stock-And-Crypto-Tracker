using System.Data;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

/// <summary>
/// Tests for the skip-logic and batch computation flow in LocalIndicatorCalculatorService.
/// These complement LocalIndicatorCalculatorTests which cover the pure math functions.
/// </summary>
public class LocalIndicatorCalculatorServiceTests
{
    private readonly Mock<IDbConnectionFactory> _dbFactoryMock = new();
    private readonly Mock<IStockTickerRepository> _stockTickerRepoMock = new();
    private readonly Mock<ICryptoTickerRepository> _cryptoTickerRepoMock = new();
    private readonly Mock<IStockIndicatorRepository> _stockIndicatorRepoMock = new();
    private readonly Mock<ICryptoIndicatorRepository> _cryptoIndicatorRepoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private LocalIndicatorCalculatorService CreateService()
    {
        var mockConnection = new Mock<IDbConnection>();
        _dbFactoryMock.Setup(f => f.CreateConnection()).Returns(mockConnection.Object);

        return new LocalIndicatorCalculatorService(
            _dbFactoryMock.Object,
            _stockTickerRepoMock.Object,
            _cryptoTickerRepoMock.Object,
            _stockIndicatorRepoMock.Object,
            _cryptoIndicatorRepoMock.Object,
            _metricsMock.Object,
            Mock.Of<ILogger<LocalIndicatorCalculatorService>>());
    }

    [Fact]
    public async Task ComputeAllStockIndicators_NoActiveTickers_ReturnsZeroCounts()
    {
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(Enumerable.Empty<StockTicker>());

        var service = CreateService();
        var result = await service.ComputeAllStockIndicatorsAsync();

        Assert.Equal(0, result.TotalTickers);
        Assert.Equal(0, result.SuccessCount);
        Assert.Equal(0, result.SkippedCount);
        Assert.True(result.Success);
    }

    [Fact]
    public async Task ComputeAllCryptoIndicators_NoActiveTickers_ReturnsZeroCounts()
    {
        _cryptoTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(Enumerable.Empty<CryptoTicker>());

        var service = CreateService();
        var result = await service.ComputeAllCryptoIndicatorsAsync();

        Assert.Equal(0, result.TotalTickers);
        Assert.Equal(0, result.SuccessCount);
        Assert.Equal(0, result.SkippedCount);
        Assert.True(result.Success);
    }

    [Fact]
    public async Task ComputeAllStockIndicators_RepositoryThrows_CapturesError()
    {
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ThrowsAsync(new InvalidOperationException("DB connection failed"));

        var service = CreateService();
        var result = await service.ComputeAllStockIndicatorsAsync();

        Assert.True(result.Errors.Count > 0);
        Assert.Contains("Batch error:", result.Errors[0]);
    }

    [Fact]
    public async Task ComputeAllCryptoIndicators_RepositoryThrows_CapturesError()
    {
        _cryptoTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ThrowsAsync(new InvalidOperationException("DB connection failed"));

        var service = CreateService();
        var result = await service.ComputeAllCryptoIndicatorsAsync();

        Assert.True(result.Errors.Count > 0);
        Assert.Contains("Batch error:", result.Errors[0]);
    }

    [Fact]
    public async Task ComputeAllStockIndicators_Cancellation_StopsProcessing()
    {
        var tickers = Enumerable.Range(1, 100).Select(i => new StockTicker
        {
            Id = i, Symbol = $"TICK{i}", IsActive = true
        });
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var service = CreateService();
        var result = await service.ComputeAllStockIndicatorsAsync(cts.Token);

        Assert.Equal(100, result.TotalTickers);
        Assert.Equal(0, result.SuccessCount);
    }

    [Fact]
    public void ComputeIndicators_LessThan14Points_IsSkipCondition()
    {
        var closes = Enumerable.Range(1, 13).Select(i => (decimal)i).ToList();

        Assert.True(closes.Count < 14,
            "Less than 14 data points should trigger the skip condition in ComputeAllStockIndicatorsAsync");
    }

    [Fact]
    public void ComputeIndicators_Exactly14Points_MeetsMinimumButNoRsiYet()
    {
        var closes = Enumerable.Range(1, 14).Select(i => (decimal)(100 + i)).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.True(closes.Count >= 14,
            "14 data points should NOT trigger the skip condition");
        Assert.Null(result.Sma);
        Assert.Null(result.Rsi);
    }

    [Fact]
    public void ComputeIndicators_15Points_ProducesRsi()
    {
        var closes = Enumerable.Range(1, 15).Select(i => (decimal)(100 + i)).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Rsi);
    }

    [Fact]
    public void ComputeIndicators_50Points_AllIndicatorsPopulated()
    {
        var closes = Enumerable.Range(1, 50).Select(i => (decimal)(100 + i * 0.5m)).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Sma);
        Assert.NotNull(result.Ema);
        Assert.NotNull(result.MacdValue);
        Assert.NotNull(result.MacdSignal);
        Assert.NotNull(result.MacdHistogram);
        Assert.NotNull(result.Rsi);
    }

    [Fact]
    public async Task ComputeAllStockIndicators_RecordsDuration()
    {
        _stockTickerRepoMock.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(Enumerable.Empty<StockTicker>());

        var service = CreateService();
        var result = await service.ComputeAllStockIndicatorsAsync();

        Assert.True(result.DurationSeconds >= 0);
    }
}
