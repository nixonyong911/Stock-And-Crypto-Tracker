using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class MassiveControllerTests
{
    private readonly Mock<IStockTickerRepository> _mockTickerRepo = new();
    private readonly Mock<ICryptoTickerRepository> _mockCryptoTickerRepo = new();
    private readonly Mock<IStockIndicatorRepository> _mockIndicatorRepo = new();
    private readonly Mock<ICryptoIndicatorRepository> _mockCryptoIndicatorRepo = new();
    private readonly MassiveController _controller;

    public MassiveControllerTests()
    {
        _controller = new MassiveController(
            _mockTickerRepo.Object,
            _mockCryptoTickerRepo.Object,
            _mockIndicatorRepo.Object,
            _mockCryptoIndicatorRepo.Object,
            Options.Create(new RabbitMQSettings()),
            Mock.Of<ILogger<MassiveController>>());
    }

    [Fact]
    public async Task GetIndicators_ValidSymbol_ReturnsOk()
    {
        var ticker = new StockTicker { Id = 1, Symbol = "AAPL" };
        _mockTickerRepo.Setup(r => r.GetBySymbolAsync("AAPL"))
            .ReturnsAsync(ticker);
        _mockIndicatorRepo.Setup(r => r.GetByTickerAndDateAsync(1, It.IsAny<DateTime>()))
            .ReturnsAsync(new List<StockIndicator>());

        var result = await _controller.GetIndicators("AAPL", "2025-01-15");

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetIndicators_InvalidDateFormat_ReturnsBadRequest()
    {
        var result = await _controller.GetIndicators("AAPL", "not-a-date");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task GetCryptoIndicators_ValidSymbol_ReturnsOk()
    {
        var ticker = new CryptoTicker { Id = 1, Symbol = "BTC/USD" };
        _mockCryptoTickerRepo.Setup(r => r.GetBySymbolAsync("BTC/USD"))
            .ReturnsAsync(ticker);
        _mockCryptoIndicatorRepo.Setup(r => r.GetByTickerAndDateAsync(1, It.IsAny<DateTime>()))
            .ReturnsAsync(new List<CryptoIndicator>());

        var result = await _controller.GetCryptoIndicators("BTC/USD", "2025-01-15");

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetCryptoIndicators_ServiceThrows_Returns500()
    {
        _mockCryptoTickerRepo.Setup(r => r.GetBySymbolAsync(It.IsAny<string>()))
            .ThrowsAsync(new Exception("DB down"));

        var result = await _controller.GetCryptoIndicators("BTC/USD");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }
}
