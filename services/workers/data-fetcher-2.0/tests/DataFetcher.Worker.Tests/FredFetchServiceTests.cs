using Xunit;
using Moq;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Domain.Providers.Fred.Entities;
using DataFetcher.Worker.Domain.Providers.Fred.Models;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Tests;

public class FredFetchServiceTests
{
    private readonly Mock<IFredApiClient> _apiClientMock;
    private readonly Mock<IFredRepository> _repoMock;
    private readonly Mock<IMetricsClient> _metricsMock;
    private readonly Mock<ILogger<FredFetchService>> _loggerMock;
    private readonly FredFetchService _service;

    public FredFetchServiceTests()
    {
        _apiClientMock = new Mock<IFredApiClient>();
        _repoMock = new Mock<IFredRepository>();
        _metricsMock = new Mock<IMetricsClient>();
        _loggerMock = new Mock<ILogger<FredFetchService>>();
        _service = new FredFetchService(
            _apiClientMock.Object, _repoMock.Object, _metricsMock.Object, _loggerMock.Object);
    }

    [Fact]
    public async Task FetchAll_NoIndicators_ReturnsZeroZero()
    {
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator>());

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(0, success);
        Assert.Equal(0, errors);
    }

    [Fact]
    public async Task FetchAll_RateIndicator_UpsertsMediaValueAndReturnsOneSuccess()
    {
        var indicator = new EconomicIndicator
        {
            SeriesId = "FEDFUNDS", DisplayMode = "rate", DisplayDivisor = 1
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });

        var obs = new FredObservation { Date = new DateTime(2026, 1, 1), Value = 5.25 };
        _apiClientMock.Setup(c => c.GetLatestObservationAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync(obs);
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        _repoMock.Verify(r => r.UpsertIndicatorWithMediaAsync(
            "FEDFUNDS", 5.25, obs.Date, 5.25, null, null, null), Times.Once);
    }

    [Fact]
    public async Task FetchAll_YoYPctIndicator_CalculatesYoYAndUpsertsCorrectly()
    {
        var indicator = new EconomicIndicator
        {
            SeriesId = "GDP", DisplayMode = "yoy_pct", DisplayDivisor = 1
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });

        var currentDate = new DateTime(2026, 1, 1);
        var currentObs = new FredObservation { Date = currentDate, Value = 110.0 };
        var yearAgoObs = new FredObservation { Date = new DateTime(2025, 1, 1), Value = 100.0 };

        _apiClientMock.Setup(c => c.GetLatestObservationAsync("GDP", It.IsAny<CancellationToken>()))
            .ReturnsAsync(currentObs);
        _apiClientMock.Setup(c => c.GetYearAgoObservationAsync("GDP", currentDate, It.IsAny<CancellationToken>()))
            .ReturnsAsync(yearAgoObs);
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("GDP", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        // YoY% = ((110 - 100) / 100) * 100 = 10.0
        _repoMock.Verify(r => r.UpsertIndicatorWithMediaAsync(
            "GDP", 110.0, currentDate, 10.0, 100.0, yearAgoObs.Date, null), Times.Once);
    }

    [Fact]
    public async Task FetchAll_ApiReturnsNullObservation_CountsAsError()
    {
        var indicator = new EconomicIndicator { SeriesId = "BAD_SERIES", DisplayMode = "rate" };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });
        _apiClientMock.Setup(c => c.GetLatestObservationAsync("BAD_SERIES", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredObservation?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(0, success);
        Assert.Equal(1, errors);
        _metricsMock.Verify(m => m.IncrementCounterAsync(
            "fred_fetch_errors_total", 1,
            It.Is<Dictionary<string, string>>(d => d["error_type"] == "api_error")), Times.Once);
    }

    [Fact]
    public async Task FetchAll_ApiThrows_CountsErrorAndContinuesToNext()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "THROWS", DisplayMode = "rate" },
            new() { SeriesId = "OK", DisplayMode = "rate" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);

        _apiClientMock.Setup(c => c.GetLatestObservationAsync("THROWS", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("timeout"));
        _apiClientMock.Setup(c => c.GetLatestObservationAsync("OK", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredObservation { Date = DateTime.UtcNow, Value = 3.0 });
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("OK", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(1, errors);
    }

    [Fact]
    public async Task FetchSingle_IndicatorNotFound_ThrowsKeyNotFoundException()
    {
        _repoMock.Setup(r => r.GetIndicatorBySeriesIdAsync("MISSING"))
            .ReturnsAsync((EconomicIndicator?)null);

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => _service.FetchSingleIndicatorAsync("MISSING"));
    }

    [Fact]
    public async Task FetchSingle_NoObservation_ThrowsInvalidOperationException()
    {
        _repoMock.Setup(r => r.GetIndicatorBySeriesIdAsync("EMPTY"))
            .ReturnsAsync(new EconomicIndicator { SeriesId = "EMPTY" });
        _apiClientMock.Setup(c => c.GetLatestObservationAsync("EMPTY", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredObservation?)null);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.FetchSingleIndicatorAsync("EMPTY"));
    }

    [Fact]
    public async Task FetchAll_ReleaseInfoApiFails_StillSucceeds()
    {
        var indicator = new EconomicIndicator
        {
            SeriesId = "CPI", DisplayMode = "rate", DisplayDivisor = 1
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator> { indicator });

        var obs = new FredObservation { Date = new DateTime(2026, 2, 1), Value = 3.1 };
        _apiClientMock.Setup(c => c.GetLatestObservationAsync("CPI", It.IsAny<CancellationToken>()))
            .ReturnsAsync(obs);
        _apiClientMock.Setup(c => c.GetSeriesReleaseAsync("CPI", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("release API down"));

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        _repoMock.Verify(r => r.UpsertIndicatorWithMediaAsync(
            "CPI", 3.1, obs.Date, 3.1, null, null, null), Times.Once);
    }
}
