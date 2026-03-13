using DataFetcher.Worker.Application;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class ProvidersControllerTests
{
    private readonly Mock<IProviderRegistry> _mockRegistry = new();
    private readonly ProvidersController _controller;

    public ProvidersControllerTests()
    {
        _controller = new ProvidersController(_mockRegistry.Object, Mock.Of<ILogger<ProvidersController>>());
    }

    [Fact]
    public void GetAll_ReturnsOkObjectResult()
    {
        _mockRegistry.Setup(r => r.GetAll())
            .Returns(new List<ProviderInfo>
            {
                new() { Name = "Finnhub", Description = "Stock fundamentals" }
            });

        var result = _controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result);
        var providers = Assert.IsAssignableFrom<IReadOnlyList<ProviderInfo>>(ok.Value);
        Assert.Single(providers);
    }

    [Fact]
    public void GetAll_WhenRegistryThrows_Returns500()
    {
        _mockRegistry.Setup(r => r.GetAll())
            .Throws(new InvalidOperationException("boom"));

        var result = _controller.GetAll();

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, status.StatusCode);
    }
}
