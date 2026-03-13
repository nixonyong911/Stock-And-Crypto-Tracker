using Xunit;
using Moq;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Domain.Providers.Fred.Entities;
using DataFetcher.Worker.Domain.Providers.Fred.Models;
using DataFetcher.Worker.Infrastructure.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class FredCalendarSyncServiceTests
{
    private readonly Mock<IFredApiClient> _apiClientMock;
    private readonly Mock<IFredRepository> _repoMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<FredCalendarSyncService>> _loggerMock;
    private readonly FredCalendarSyncService _service;

    public FredCalendarSyncServiceTests()
    {
        _apiClientMock = new Mock<IFredApiClient>();
        _repoMock = new Mock<IFredRepository>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<FredCalendarSyncService>>();
        _service = new FredCalendarSyncService(
            _apiClientMock.Object, _repoMock.Object, _metricsMock.Object, _loggerMock.Object);
    }

    [Fact]
    public async Task SyncCalendar_NoIndicators_ReturnsZeroZero()
    {
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator>());

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(0, success);
        Assert.Equal(0, errors);
    }

    [Fact]
    public async Task SyncCalendar_Succeeds_UpsertsEntryWithCorrectFields()
    {
        var indicator = new EconomicIndicator { SeriesId = "FEDFUNDS" };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });

        var releaseInfo = new FredReleaseInfo
        {
            ReleaseId = 10, ReleaseName = "H.15", ReleaseLink = "https://fred.example.com/release/10"
        };
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync(releaseInfo);

        var nextDate = new DateTime(2026, 4, 1);
        var followingDate = new DateTime(2026, 5, 1);
        var dates = new List<FredReleaseDate>
        {
            new() { ReleaseId = 10, Date = nextDate },
            new() { ReleaseId = 10, Date = followingDate }
        };
        _apiClientMock.Setup(c => c.GetReleaseDatesAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(dates);

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        _repoMock.Verify(r => r.UpsertReleaseCalendarAsync(It.Is<ReleaseCalendarEntry>(e =>
            e.SeriesId == "FEDFUNDS" &&
            e.ReleaseId == 10 &&
            e.ReleaseName == "H.15" &&
            e.ReleaseLink == "https://fred.example.com/release/10" &&
            e.NextReleaseDate == nextDate &&
            e.FollowingReleaseDate == followingDate
        )), Times.Once);
    }

    [Fact]
    public async Task SyncCalendar_ReleaseInfoNull_CountsAsError()
    {
        var indicator = new EconomicIndicator { SeriesId = "MISSING" };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("MISSING", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(0, success);
        Assert.Equal(1, errors);
    }

    [Fact]
    public async Task SyncCalendar_ApiThrowsForOne_CountsErrorAndContinues()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "THROWS" },
            new() { SeriesId = "OK" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);

        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("THROWS", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("timeout"));

        var releaseInfo = new FredReleaseInfo { ReleaseId = 5, ReleaseName = "OK Release" };
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("OK", It.IsAny<CancellationToken>()))
            .ReturnsAsync(releaseInfo);
        _apiClientMock.Setup(c => c.GetReleaseDatesAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FredReleaseDate>());

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(1, success);
        Assert.Equal(1, errors);
    }

    [Fact]
    public async Task SyncCalendar_SharedReleaseId_CachesReleaseDates()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "SERIES_A" },
            new() { SeriesId = "SERIES_B" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);

        var sharedRelease = new FredReleaseInfo { ReleaseId = 42, ReleaseName = "Shared Release" };
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(sharedRelease);

        var dates = new List<FredReleaseDate>
        {
            new() { ReleaseId = 42, Date = new DateTime(2026, 6, 1) }
        };
        _apiClientMock.Setup(c => c.GetReleaseDatesAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(dates);

        var (success, _) = await _service.SyncCalendarAsync();

        Assert.Equal(2, success);
        _apiClientMock.Verify(c => c.GetReleaseDatesAsync(42, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SyncCalendar_GetReleaseDatesThrows_StillSucceedsWithEmptyDates()
    {
        var indicator = new EconomicIndicator { SeriesId = "CPI" };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });

        var releaseInfo = new FredReleaseInfo { ReleaseId = 20, ReleaseName = "CPI Release" };
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("CPI", It.IsAny<CancellationToken>()))
            .ReturnsAsync(releaseInfo);
        _apiClientMock.Setup(c => c.GetReleaseDatesAsync(20, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("dates API down"));

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        _repoMock.Verify(r => r.UpsertReleaseCalendarAsync(It.Is<ReleaseCalendarEntry>(e =>
            e.NextReleaseDate == null && e.FollowingReleaseDate == null
        )), Times.Once);
    }
}
