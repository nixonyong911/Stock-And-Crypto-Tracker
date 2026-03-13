using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class SchedulesControllerTests
{
    private readonly Mock<IFetchScheduleRepository> _mockRepo = new();
    private readonly SchedulesController _controller;

    public SchedulesControllerTests()
    {
        _controller = new SchedulesController(_mockRepo.Object, Mock.Of<ILogger<SchedulesController>>());
    }

    [Fact]
    public async Task GetAll_ReturnsOkWithServiceName()
    {
        _mockRepo.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>());

        var result = await _controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ScheduleDiscoveryResponse>(ok.Value);
        Assert.Equal("data-fetcher-2.0", response.Service);
    }

    [Fact]
    public async Task GetAll_WithSchedules_ReturnsNonEmptyList()
    {
        _mockRepo.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { Id = 1, Name = "fred-fetch", IsEnabled = true, ScheduleTime = new TimeSpan(14, 0, 0) },
                new() { Id = 2, Name = "news-fetch", IsEnabled = false, ScheduleTime = new TimeSpan(8, 0, 0) }
            });

        var result = await _controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ScheduleDiscoveryResponse>(ok.Value);
        Assert.Equal(2, response.Schedules.Count);
    }

    [Fact]
    public async Task GetAll_WithEmptySchedules_ReturnsEmptyList()
    {
        _mockRepo.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>());

        var result = await _controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ScheduleDiscoveryResponse>(ok.Value);
        Assert.Empty(response.Schedules);
    }

    [Fact]
    public async Task Toggle_ExistingSchedule_ReturnsOk()
    {
        _mockRepo.Setup(r => r.ToggleScheduleAsync(1))
            .ReturnsAsync(new FetchSchedule { Id = 1, Name = "fred-fetch", IsEnabled = true });

        var result = await _controller.Toggle(1);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ScheduleToggleResponse>(ok.Value);
        Assert.Equal(1, response.Id);
        Assert.True(response.IsEnabled);
    }

    [Fact]
    public async Task Toggle_NonExistentSchedule_ReturnsNotFound()
    {
        _mockRepo.Setup(r => r.ToggleScheduleAsync(999))
            .ReturnsAsync((FetchSchedule?)null);

        var result = await _controller.Toggle(999);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task GetAll_IntervalSchedule_MapsCadenceTypeAsInterval()
    {
        _mockRepo.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { Id = 1, Name = "interval-job", IsEnabled = true, IntervalMinutes = 15, OffsetMinutes = 5 }
            });

        var result = await _controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ScheduleDiscoveryResponse>(ok.Value);
        Assert.Single(response.Schedules);
        Assert.Equal("interval", response.Schedules[0].CadenceType);
    }
}
