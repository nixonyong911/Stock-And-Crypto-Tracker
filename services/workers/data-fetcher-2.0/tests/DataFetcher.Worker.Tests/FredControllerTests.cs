using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Domain.Providers.Fred.Entities;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FredControllerTests
{
    private readonly Mock<IFredFetchService> _mockFetchService = new();
    private readonly Mock<IFredCalendarSyncService> _mockSyncService = new();
    private readonly Mock<IFredRepository> _mockRepo = new();
    private readonly FredController _controller;

    public FredControllerTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_mockFetchService.Object);
        services.AddSingleton(_mockSyncService.Object);
        services.AddSingleton(_mockRepo.Object);
        var provider = services.BuildServiceProvider();

        _controller = new FredController(provider, Mock.Of<ILogger<FredController>>());
    }

    [Fact]
    public async Task GetStatus_ReturnsOk()
    {
        _mockRepo.Setup(r => r.GetAllIndicatorStatusAsync())
            .ReturnsAsync(new List<IndicatorStatus>
            {
                new() { SeriesId = "GDP", DisplayName = "Gross Domestic Product", Category = "Growth" }
            });

        var result = await _controller.GetStatus(null);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task TriggerAll_Success_ReturnsOk()
    {
        _mockFetchService.Setup(s => s.FetchAllIndicatorsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((5, 0));

        var result = await _controller.TriggerAll(CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task TriggerAll_ServiceThrows_Returns500()
    {
        _mockFetchService.Setup(s => s.FetchAllIndicatorsAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("API down"));

        var result = await _controller.TriggerAll(CancellationToken.None);

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }

    [Fact]
    public async Task TriggerSingle_UnknownSeries_ReturnsNotFound()
    {
        _mockFetchService.Setup(s => s.FetchSingleIndicatorAsync("UNKNOWN", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException("not found"));

        var result = await _controller.TriggerSingle("unknown", CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task TriggerSingle_GenericException_Returns500()
    {
        _mockFetchService.Setup(s => s.FetchSingleIndicatorAsync("GDP", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("timeout"));

        var result = await _controller.TriggerSingle("gdp", CancellationToken.None);

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }

    [Fact]
    public async Task GetCalendar_WithoutDays_CallsGetAllReleaseCalendar()
    {
        _mockRepo.Setup(r => r.GetAllReleaseCalendarAsync())
            .ReturnsAsync(new List<ReleaseCalendarEntry>())
            .Verifiable();

        await _controller.GetCalendar(null);

        _mockRepo.Verify(r => r.GetAllReleaseCalendarAsync(), Times.Once);
        _mockRepo.Verify(r => r.GetUpcomingReleasesAsync(It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task GetCalendar_WithDays_CallsGetUpcomingReleases()
    {
        _mockRepo.Setup(r => r.GetUpcomingReleasesAsync(7))
            .ReturnsAsync(new List<ReleaseCalendarEntry>())
            .Verifiable();

        await _controller.GetCalendar(7);

        _mockRepo.Verify(r => r.GetUpcomingReleasesAsync(7), Times.Once);
        _mockRepo.Verify(r => r.GetAllReleaseCalendarAsync(), Times.Never);
    }

    [Fact]
    public async Task SyncCalendar_Success_ReturnsOk()
    {
        _mockSyncService.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((10, 1));

        var result = await _controller.SyncCalendar(CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }
}
