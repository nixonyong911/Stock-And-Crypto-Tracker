using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubControllerTests
{
    private readonly Mock<IFundamentalsFetchService> _mockFundamentals = new();
    private readonly Mock<IStockTickerRepository> _mockTickerRepo = new();
    private readonly Mock<IFetchScheduleRepository> _mockScheduleRepo = new();
    private readonly FinnhubController _controller;

    public FinnhubControllerTests()
    {
        var settings = Options.Create(new FinnhubSettings
        {
            BaseUrl = "https://test",
            ApiKey = "test-key",
            RateLimitDelayMs = 100
        });

        _controller = new FinnhubController(
            _mockFundamentals.Object,
            _mockTickerRepo.Object,
            _mockScheduleRepo.Object,
            settings,
            Mock.Of<ILogger<FinnhubController>>());
    }

    [Fact]
    public async Task GetStatus_ReturnsOkObjectResult()
    {
        _mockScheduleRepo.Setup(r => r.GetScheduleByDataSourceNameAsync("Finnhub"))
            .ReturnsAsync((FetchSchedule?)null);

        var result = await _controller.GetStatus();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<FinnhubStatusResponse>(ok.Value);
        Assert.Equal("Finnhub", response.Provider);
    }

    [Fact]
    public async Task TriggerSingle_WhenTickerNotFound_ReturnsNotFound()
    {
        _mockTickerRepo.Setup(r => r.GetByIdAsync(999))
            .ReturnsAsync((StockTicker?)null);

        var result = await _controller.TriggerSingle(999, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task TriggerSingle_WhenServiceThrows_ReturnsOkWithSuccessFalse()
    {
        var ticker = new StockTicker { Id = 1, Symbol = "AAPL" };
        _mockTickerRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(ticker);
        _mockFundamentals.Setup(s => s.FetchAndStoreFundamentalsAsync(ticker, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("API error"));

        var result = await _controller.TriggerSingle(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TriggerResponse>(ok.Value);
        Assert.False(response.Success);
    }

    [Fact]
    public async Task TriggerAll_Success_ReturnsOkWithSuccessTrue()
    {
        _mockFundamentals.Setup(s => s.FetchAndStoreAllFundamentalsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(5);

        var result = await _controller.TriggerAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TriggerResponse>(ok.Value);
        Assert.True(response.Success);
        Assert.Equal(5, response.RecordsProcessed);
    }
}
