using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class TickerControllerTests
{
    private readonly Mock<IAlpacaTickerManagementService> _mockService = new();
    private readonly TickerController _controller;

    public TickerControllerTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_mockService.Object);
        var provider = services.BuildServiceProvider();
        _controller = new TickerController(provider, Mock.Of<ILogger<TickerController>>());
    }

    [Fact]
    public async Task AddTicker_WithEmptySymbol_ReturnsBadRequest()
    {
        var request = new AlpacaAddTickerRequest { Symbol = "" };

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_Success_ReturnsOk()
    {
        var request = new AlpacaAddTickerRequest { Symbol = "AAPL" };
        _mockService.Setup(s => s.AddTickerAsync(It.IsAny<AlpacaAddTickerRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaAddTickerResult
            {
                ResultCode = "OK",
                Message = "Added AAPL",
                Data = new AlpacaTickerData { Id = 1, Symbol = "AAPL" }
            });

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_WhenServiceReturnsNotFound_ReturnsNotFound()
    {
        var request = new AlpacaAddTickerRequest { Symbol = "INVALID" };
        _mockService.Setup(s => s.AddTickerAsync(It.IsAny<AlpacaAddTickerRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaAddTickerResult
            {
                ResultCode = "NOT_FOUND",
                ErrorCode = "ASSET_NOT_FOUND",
                Message = "Asset not found"
            });

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task ToggleTicker_WhenNotFound_ReturnsNotFound()
    {
        _mockService.Setup(s => s.ToggleTickerAsync(999, "stock", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaAddTickerResult
            {
                ResultCode = "NOT_FOUND",
                Message = "Ticker not found"
            });

        var result = await _controller.ToggleTicker(999, "stock", CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }
}
