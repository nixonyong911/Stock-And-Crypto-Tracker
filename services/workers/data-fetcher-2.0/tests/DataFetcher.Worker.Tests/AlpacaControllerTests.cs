using System.Text.Json;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class AlpacaControllerTests
{
    private readonly AlpacaController _controller;

    public AlpacaControllerTests()
    {
        var rabbitSettings = Options.Create(new RabbitMQSettings());
        _controller = new AlpacaController(
            new Mock<IServiceProvider>().Object,
            rabbitSettings,
            Mock.Of<ILogger<AlpacaController>>());
    }

    [Fact]
    public void GetStatus_ReturnsOkObjectResult()
    {
        var result = _controller.GetStatus();

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public void HandleNewTickerWebhook_MissingSymbol_ReturnsBadRequest()
    {
        var json = JsonDocument.Parse("""{"record": {"symbol": ""}}""").RootElement;

        var result = _controller.HandleNewTickerWebhook(json);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void HandleNewTickerWebhook_NoRecordProperty_ReturnsBadRequest()
    {
        var json = JsonDocument.Parse("""{"foo": "bar"}""").RootElement;

        var result = _controller.HandleNewTickerWebhook(json);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void HandleNewCryptoTickerWebhook_MissingSymbol_ReturnsBadRequest()
    {
        var json = JsonDocument.Parse("""{"record": {"symbol": ""}}""").RootElement;

        var result = _controller.HandleNewCryptoTickerWebhook(json);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void QueueStockBackfill_NoRabbitMQ_Returns500()
    {
        var result = _controller.QueueStockBackfill("AAPL");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }

    [Fact]
    public void QueueCryptoBackfill_NoRabbitMQ_Returns500()
    {
        var result = _controller.QueueCryptoBackfill("BTC");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }

    [Fact]
    public void HandleNewTickerWebhook_ValidSymbol_NoRabbitMQ_ReturnsBadRequest()
    {
        var json = JsonDocument.Parse("""{"record": {"symbol": "AAPL", "exchange": "NASDAQ"}}""").RootElement;

        var result = _controller.HandleNewTickerWebhook(json);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void HandleNewCryptoTickerWebhook_ValidSymbol_NoRabbitMQ_ReturnsBadRequest()
    {
        var json = JsonDocument.Parse("""{"record": {"symbol": "BTC/USD"}}""").RootElement;

        var result = _controller.HandleNewCryptoTickerWebhook(json);

        Assert.IsType<BadRequestObjectResult>(result);
    }
}
