using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class PriceTargetControllerTests
{
    private readonly Mock<IPriceTargetBackfillService> _mockBackfillService = new();
    private readonly Mock<ICryptoPriceTargetBackfillService> _mockCryptoBackfillService = new();
    private readonly Mock<IStockPriceRepository> _mockStockPriceRepo = new();
    private readonly Mock<ICryptoTickerRepository> _mockCryptoTickerRepo = new();
    private readonly PriceTargetController _controller;

    public PriceTargetControllerTests()
    {
        _controller = new PriceTargetController(
            _mockBackfillService.Object,
            _mockCryptoBackfillService.Object,
            _mockStockPriceRepo.Object,
            _mockCryptoTickerRepo.Object,
            Mock.Of<ILogger<PriceTargetController>>());
    }

    [Fact]
    public void GetStatus_ReturnsOkObjectResult()
    {
        var result = _controller.GetStatus();

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task BackfillSymbol_Success_ReturnsOk()
    {
        var ticker = new StockTicker { Id = 1, Symbol = "AAPL" };
        _mockStockPriceRepo.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(new List<StockTicker> { ticker });
        _mockBackfillService.Setup(s => s.BackfillAsync(1, "AAPL", 90, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BackfillResult { TotalDates = 90, Computed = 85, Skipped = 5, Failed = 0, Duration = TimeSpan.FromSeconds(10) });

        var result = await _controller.BackfillSymbol("AAPL");

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task BackfillSymbol_ServiceThrows_Returns500()
    {
        var ticker = new StockTicker { Id = 1, Symbol = "AAPL" };
        _mockStockPriceRepo.Setup(r => r.GetActiveTickersAsync())
            .ReturnsAsync(new List<StockTicker> { ticker });
        _mockBackfillService.Setup(s => s.BackfillAsync(1, "AAPL", 90, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Service error"));

        var result = await _controller.BackfillSymbol("AAPL");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }
}
