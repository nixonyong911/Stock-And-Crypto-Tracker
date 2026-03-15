using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Application.Providers.Common;
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
    private readonly Mock<ITickerManagementService> _mockService = new();
    private readonly Mock<IAlpacaTickerManagementService> _mockAlpacaService = new();
    private readonly TickerController _controller;

    public TickerControllerTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_mockService.Object);
        services.AddSingleton(_mockAlpacaService.Object);
        var provider = services.BuildServiceProvider();
        _controller = new TickerController(provider, Mock.Of<ILogger<TickerController>>());
    }

    [Fact]
    public async Task AddTicker_WithEmptySymbol_ReturnsBadRequest()
    {
        var request = new AddTickerRequest { Symbol = "" };

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_Success_ReturnsOk()
    {
        var request = new AddTickerRequest { Symbol = "AAPL" };
        _mockService.Setup(s => s.AddTickerAsync(It.IsAny<AddTickerRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddTickerResult
            {
                ResultCode = "OK",
                Message = "Added AAPL",
                Provider = "Alpaca",
                Data = new AddTickerData { Id = 1, Symbol = "AAPL" }
            });

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_WhenServiceReturnsNotFound_ReturnsNotFound()
    {
        var request = new AddTickerRequest { Symbol = "INVALID" };
        _mockService.Setup(s => s.AddTickerAsync(It.IsAny<AddTickerRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddTickerResult
            {
                ResultCode = "NOT_FOUND",
                ErrorCode = "NOT_FOUND",
                Message = "Symbol not found on any provider"
            });

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_WithInvalidAssetType_ReturnsBadRequest()
    {
        var request = new AddTickerRequest { Symbol = "AAPL", AssetType = "Bond" };

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_WithInvalidSymbolFormat_ReturnsBadRequest()
    {
        var request = new AddTickerRequest { Symbol = "AAPL!@#" };

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Theory]
    [InlineData("Stock")]
    [InlineData("Etf")]
    [InlineData("Crypto")]
    [InlineData("Commodity")]
    [InlineData("Index")]
    public async Task AddTicker_WithValidAssetTypes_PassesValidation(string assetType)
    {
        var request = new AddTickerRequest { Symbol = "TEST", AssetType = assetType };
        _mockService.Setup(s => s.AddTickerAsync(It.IsAny<AddTickerRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddTickerResult { ResultCode = "OK", Message = "OK" });

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Theory]
    [InlineData("DROP")]
    [InlineData("SELECT")]
    [InlineData("UNION")]
    [InlineData("delete")]
    public async Task AddTicker_WithSqlKeyword_ReturnsBadRequest(string symbol)
    {
        var request = new AddTickerRequest { Symbol = symbol };

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Theory]
    [InlineData("AAPL")]
    [InlineData("BTC/USD")]
    [InlineData("SHEL.L")]
    [InlineData("BRK-B")]
    [InlineData("S&P500")]
    public async Task AddTicker_WithValidSymbolFormats_PassesValidation(string symbol)
    {
        var request = new AddTickerRequest { Symbol = symbol };
        _mockService.Setup(s => s.AddTickerAsync(It.IsAny<AddTickerRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddTickerResult { ResultCode = "OK", Message = "OK" });

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task AddTicker_WithTooLongSymbol_ReturnsBadRequest()
    {
        var request = new AddTickerRequest { Symbol = new string('A', 21) };

        var result = await _controller.AddTicker(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task ToggleTicker_WhenNotFound_ReturnsNotFound()
    {
        _mockAlpacaService.Setup(s => s.ToggleTickerAsync(999, "stock", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaAddTickerResult
            {
                ResultCode = "NOT_FOUND",
                Message = "Ticker not found"
            });

        var result = await _controller.ToggleTicker(999, "stock", CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }
}
