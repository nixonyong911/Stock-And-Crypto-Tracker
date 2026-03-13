using DataFetcher.Worker.Application.Scheduling;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class EarningsControllerTests
{
    private readonly Mock<IEarningsSyncService> _mockSyncService = new();
    private readonly Mock<IFetchScheduleRepository> _mockScheduleRepo = new();
    private readonly EarningsController _controller;

    public EarningsControllerTests()
    {
        _controller = new EarningsController(
            _mockSyncService.Object,
            _mockScheduleRepo.Object,
            Mock.Of<ILogger<EarningsController>>());
    }

    [Fact]
    public async Task GetStatus_ReturnsOkObjectResult()
    {
        _mockScheduleRepo.Setup(r => r.GetScheduleByNameAsync("Monthly Earnings Sync"))
            .ReturnsAsync((FetchSchedule?)null);

        var result = await _controller.GetStatus();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<EarningsSyncStatusResponse>(ok.Value);
        Assert.Equal("EarningsSync", response.Service);
    }

    [Fact]
    public async Task TriggerSyncAll_Success_ReturnsOkWithSuccessTrue()
    {
        var syncResult = new EarningsSyncResult
        {
            TotalTickers = 5,
            SuccessCount = 5,
            RecordsUpserted = 20,
            Duration = TimeSpan.FromSeconds(3)
        };
        _mockSyncService.Setup(s => s.SyncAllTickersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(syncResult);
        _mockScheduleRepo.Setup(r => r.GetScheduleByNameAsync("Monthly Earnings Sync"))
            .ReturnsAsync((FetchSchedule?)null);

        var result = await _controller.TriggerSyncAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<EarningsSyncResponse>(ok.Value);
        Assert.True(response.Success);
        Assert.Equal(20, response.RecordsUpserted);
    }

    [Fact]
    public async Task TriggerSyncAll_WhenServiceThrows_ReturnsOkWithSuccessFalse()
    {
        _mockSyncService.Setup(s => s.SyncAllTickersAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("sync failed"));

        var result = await _controller.TriggerSyncAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<EarningsSyncResponse>(ok.Value);
        Assert.False(response.Success);
    }
}
