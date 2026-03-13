using DataFetcher.Worker.Application.Providers.AlphaVantage;
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

public class AlphaVantageControllerTests
{
    private readonly Mock<IEarningsCalendarService> _mockEarnings = new();
    private readonly Mock<IStockTickerRepository> _mockTickerRepo = new();
    private readonly Mock<IFetchScheduleRepository> _mockScheduleRepo = new();
    private readonly AlphaVantageController _controller;

    public AlphaVantageControllerTests()
    {
        var settings = Options.Create(new AlphaVantageSettings
        {
            BaseUrl = "https://test",
            ApiKey = "test-key",
            RateLimitDelayMs = 100,
            Horizon = "3month"
        });

        _controller = new AlphaVantageController(
            _mockEarnings.Object,
            _mockTickerRepo.Object,
            _mockScheduleRepo.Object,
            settings,
            Mock.Of<ILogger<AlphaVantageController>>());
    }

    [Fact]
    public async Task GetStatus_ReturnsOkObjectResult()
    {
        _mockScheduleRepo.Setup(r => r.GetScheduleByDataSourceNameAsync("AlphaVantage"))
            .ReturnsAsync((FetchSchedule?)null);
        _mockTickerRepo.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(new List<StockTicker>());

        var result = await _controller.GetStatus();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<AlphaVantageStatusResponse>(ok.Value);
        Assert.Equal("AlphaVantage", response.Provider);
    }

    [Fact]
    public async Task TriggerSyncAll_Success_ReturnsOkWithSuccessTrue()
    {
        _mockEarnings.Setup(s => s.SyncAllEarningsCalendarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(10);

        var result = await _controller.TriggerSyncAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TriggerResponse>(ok.Value);
        Assert.True(response.Success);
        Assert.Equal(10, response.RecordsProcessed);
    }

    [Fact]
    public async Task TriggerSyncAll_WhenServiceThrows_ReturnsOkWithSuccessFalse()
    {
        _mockEarnings.Setup(s => s.SyncAllEarningsCalendarAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("API error"));

        var result = await _controller.TriggerSyncAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TriggerResponse>(ok.Value);
        Assert.False(response.Success);
    }
}
