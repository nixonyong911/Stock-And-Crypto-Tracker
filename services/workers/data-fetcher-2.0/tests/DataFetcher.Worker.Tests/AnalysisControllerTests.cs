using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class AnalysisControllerTests
{
    private readonly Mock<ICandlestickAnalysisService> _mockAnalysisService = new();
    private readonly Mock<ICryptoCandlestickAnalysisService> _mockCryptoAnalysisService = new();
    private readonly Mock<IAnalysisRepository> _mockAnalysisRepo = new();
    private readonly Mock<ICryptoAnalysisRepository> _mockCryptoAnalysisRepo = new();
    private readonly Mock<IStockPriceRepository> _mockStockPriceRepo = new();
    private readonly Mock<ICryptoPriceRepository> _mockCryptoPriceRepo = new();
    private readonly Mock<IFetchScheduleRepository> _mockScheduleRepo = new();
    private readonly AnalysisController _controller;

    public AnalysisControllerTests()
    {
        _controller = new AnalysisController(
            _mockAnalysisService.Object,
            _mockCryptoAnalysisService.Object,
            _mockAnalysisRepo.Object,
            _mockCryptoAnalysisRepo.Object,
            _mockStockPriceRepo.Object,
            _mockCryptoPriceRepo.Object,
            _mockScheduleRepo.Object,
            Options.Create(new RabbitMQSettings()),
            Mock.Of<ILogger<AnalysisController>>());
    }

    [Fact]
    public async Task GetStatus_ReturnsOkObjectResult()
    {
        _mockScheduleRepo.Setup(r => r.GetScheduleByDataSourceNameAsync("CandlestickAnalysis"))
            .ReturnsAsync(new FetchSchedule { IsEnabled = true, Name = "CandlestickAnalysis", ScheduleTime = TimeSpan.FromHours(6) });

        var result = await _controller.GetStatus();

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task TriggerAnalysis_InvalidDateFormat_ReturnsBadRequest()
    {
        var result = await _controller.TriggerAnalysis("AAPL", "not-a-date");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task TriggerAnalysis_ServiceThrows_Returns500()
    {
        _mockStockPriceRepo.Setup(r => r.GetActiveTickersAsync())
            .ThrowsAsync(new Exception("DB error"));

        var result = await _controller.TriggerAnalysis("AAPL");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }

    [Fact]
    public void QueueBackfill_ServiceThrows_Returns500()
    {
        var result = _controller.QueueBackfill("AAPL");

        var objectResult = result.Result as ObjectResult;
        Assert.NotNull(objectResult);
        Assert.Equal(500, objectResult.StatusCode);
    }
}
