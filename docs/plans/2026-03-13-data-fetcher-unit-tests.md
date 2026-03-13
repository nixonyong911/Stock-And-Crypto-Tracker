# Data-Fetcher-2.0 Unit Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive unit tests with mock data to eliminate manual testing after code changes.

**Architecture:** xUnit + Moq tests organized by layer (Controllers, Workers, Services, Utilities). All external dependencies (DB repos, API clients, metrics, loggers) are mocked. Tests run in Docker build and CI.

**Tech Stack:** xUnit 2.7, Moq 4.20, .NET 8.0 (existing test project at `tests/DataFetcher.Worker.Tests/`)

---

## Existing Test Coverage (54 tests)

| File | Tests | Covers |
|------|-------|--------|
| `IntervalScheduleHelperTests.cs` | 12 | Interval + daily scheduling math |
| `LocalIndicatorCalculatorTests.cs` | 12 | SMA, EMA, MACD, RSI computation |
| `GatewayAlertNotifierTests.cs` | 6 | HTTP notify, headers, error resilience |
| `MarketAuxNewsFetchServiceTests.cs` | 24 | Sentiment, mapping, pagination, rate limiting |

## New Tests to Add

| Task | Test File | Tests | Priority |
|------|-----------|-------|----------|
| 1 | `MediaValueCalculatorTests.cs` | 8 | High - new FRED code |
| 2 | `FredFetchServiceTests.cs` | 8 | High - new FRED code |
| 3 | `FredCalendarSyncServiceTests.cs` | 6 | High - new FRED code |
| 4 | `FredApiClientTests.cs` | 6 | High - release frequency logic |
| 5 | `SchedulesControllerTests.cs` | 6 | High - new schedules endpoint |
| 6 | `FredControllerTests.cs` | 8 | High - new FRED endpoints |
| 7 | `FredFetchWorkerTests.cs` | 5 | Medium - worker loop patterns |
| 8 | `FredCalendarSyncWorkerTests.cs` | 4 | Medium - weekly scheduling |
| 9 | `AlpacaStockFetchWorkerTests.cs` | 4 | Medium - interval worker pattern |
| 10 | `FetchScheduleMapperTests.cs` | 4 | Medium - DTO mapping |
| 11 | Fix missing try-catch | 0 (code fix) | High - error handling gaps |

**Total new tests: ~59**

---

## Task 1: MediaValueCalculatorTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/MediaValueCalculatorTests.cs`

**Why:** `MediaValueCalculator` is new FRED code with pure static methods — easy to test, high value. Also validates the unused `divisor` parameter.

**Step 1: Write tests**

```csharp
using DataFetcher.Worker.Application.Providers.Fred;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class MediaValueCalculatorTests
{
    [Fact]
    public void CalculateMediaValue_ModeRate_ReturnsRawValue()
    {
        var result = MediaValueCalculator.CalculateMediaValue("rate", 5.25, null, 1);
        Assert.Equal(5.25, result);
    }

    [Fact]
    public void CalculateMediaValue_ModeYoYPct_CalculatesPercentChange()
    {
        // 110 vs 100 year ago = +10%
        var result = MediaValueCalculator.CalculateMediaValue("yoy_pct", 110, 100, 1);
        Assert.Equal(10.0, result);
    }

    [Fact]
    public void CalculateMediaValue_ModeYoYPct_NoYearAgo_ReturnsNull()
    {
        var result = MediaValueCalculator.CalculateMediaValue("yoy_pct", 110, null, 1);
        Assert.Null(result);
    }

    [Fact]
    public void CalculateMediaValue_ModeYoYPct_ZeroYearAgo_ReturnsNull()
    {
        var result = MediaValueCalculator.CalculateMediaValue("yoy_pct", 110, 0, 1);
        Assert.Null(result);
    }

    [Fact]
    public void CalculateMediaValue_TrillionsFromBillions_DividesByThousand()
    {
        var result = MediaValueCalculator.CalculateMediaValue("trillions_from_billions", 25000, null, 1);
        Assert.Equal(25.0, result);
    }

    [Fact]
    public void CalculateMediaValue_TrillionsFromMillions_DividesByMillion()
    {
        var result = MediaValueCalculator.CalculateMediaValue("trillions_from_millions", 25000000, null, 1);
        Assert.Equal(25.0, result);
    }

    [Fact]
    public void CalculateMediaValue_UnknownMode_ReturnsRawValue()
    {
        var result = MediaValueCalculator.CalculateMediaValue("unknown_mode", 42.5, null, 1);
        Assert.Equal(42.5, result);
    }

    [Fact]
    public void NeedsYearAgoData_OnlyTrueForYoYPct()
    {
        Assert.True(MediaValueCalculator.NeedsYearAgoData("yoy_pct"));
        Assert.False(MediaValueCalculator.NeedsYearAgoData("rate"));
        Assert.False(MediaValueCalculator.NeedsYearAgoData("trillions_from_billions"));
        Assert.False(MediaValueCalculator.NeedsYearAgoData("trillions_from_millions"));
    }
}
```

**Step 2: Run test**

```bash
cd services/workers/data-fetcher-2.0
dotnet test --filter "FullyQualifiedName~MediaValueCalculatorTests" --verbosity normal
```

Expected: All 8 pass.

**Step 3: Commit**

```bash
git add tests/DataFetcher.Worker.Tests/MediaValueCalculatorTests.cs
git commit -m "test: add MediaValueCalculator unit tests"
```

---

## Task 2: FredFetchServiceTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/FredFetchServiceTests.cs`
- Reference: `src/DataFetcher.Worker/Application/Providers/Fred/FredFetchService.cs`

**Why:** Core FRED business logic — fetches indicators, computes media values, handles partial failures.

**Mocks needed:**
- `IFredApiClient` — returns mock observations
- `IFredRepository` — returns mock indicator list, captures upserts
- `IMetricsClient` — no-op
- `ILogger<FredFetchService>` — no-op

**Step 1: Write tests**

```csharp
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

public class FredFetchServiceTests
{
    private readonly Mock<IFredApiClient> _apiClientMock = new();
    private readonly Mock<IFredRepository> _repoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();
    private readonly Mock<ILogger<FredFetchService>> _loggerMock = new();
    private readonly FredFetchService _service;

    public FredFetchServiceTests()
    {
        _service = new FredFetchService(
            _apiClientMock.Object, _repoMock.Object,
            _metricsMock.Object, _loggerMock.Object);
    }

    [Fact]
    public async Task FetchAll_NoIndicators_ReturnsZeroCounts()
    {
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator>());

        var (success, errors) = await _service.FetchAllIndicatorsAsync();
        Assert.Equal(0, success);
        Assert.Equal(0, errors);
    }

    [Fact]
    public async Task FetchAll_SingleRateIndicator_UpsertsAndCountsSuccess()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "FEDFUNDS", DisplayMode = "rate", DisplayDivisor = 1 }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredObservation { Date = DateTime.UtcNow, Value = 5.25 });
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        _repoMock.Verify(r => r.UpsertIndicatorWithMediaAsync(
            "FEDFUNDS", 5.25, It.IsAny<DateTime>(), 5.25, null, null, null), Times.Once);
    }

    [Fact]
    public async Task FetchAll_YoYIndicator_FetchesYearAgoAndCalculatesMedia()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "GDPC1", DisplayMode = "yoy_pct", DisplayDivisor = 1 }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("GDPC1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredObservation { Date = new DateTime(2026, 1, 1), Value = 22000 });
        _apiClientMock.Setup(a => a.GetYearAgoObservationAsync("GDPC1", It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredObservation { Date = new DateTime(2025, 1, 1), Value = 20000 });
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("GDPC1", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        // YoY% = (22000 - 20000) / 20000 * 100 = 10.0
        _repoMock.Verify(r => r.UpsertIndicatorWithMediaAsync(
            "GDPC1", 22000, It.IsAny<DateTime>(), 10.0, 20000.0, It.IsAny<DateTime?>(), null), Times.Once);
    }

    [Fact]
    public async Task FetchAll_ApiReturnsNull_CountsAsError()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "BAD_SERIES", DisplayMode = "rate", DisplayDivisor = 1 }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("BAD_SERIES", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredObservation?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(0, success);
        Assert.Equal(1, errors);
    }

    [Fact]
    public async Task FetchAll_ApiThrows_CountsAsErrorContinuesNext()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "THROWS", DisplayMode = "rate", DisplayDivisor = 1 },
            new() { SeriesId = "OK", DisplayMode = "rate", DisplayDivisor = 1 }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("THROWS", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("timeout"));
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("OK", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredObservation { Date = DateTime.UtcNow, Value = 3.5 });
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("OK", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        Assert.Equal(1, success);
        Assert.Equal(1, errors);
    }

    [Fact]
    public async Task FetchSingle_IndicatorNotFound_ThrowsKeyNotFound()
    {
        _repoMock.Setup(r => r.GetIndicatorBySeriesIdAsync("MISSING"))
            .ReturnsAsync((EconomicIndicator?)null);

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => _service.FetchSingleIndicatorAsync("MISSING"));
    }

    [Fact]
    public async Task FetchSingle_NoObservation_ThrowsInvalidOperation()
    {
        _repoMock.Setup(r => r.GetIndicatorBySeriesIdAsync("FEDFUNDS"))
            .ReturnsAsync(new EconomicIndicator { SeriesId = "FEDFUNDS" });
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredObservation?)null);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.FetchSingleIndicatorAsync("FEDFUNDS"));
    }

    [Fact]
    public async Task FetchAll_ReleaseInfoFailure_StillSucceeds()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "FEDFUNDS", DisplayMode = "rate", DisplayDivisor = 1 }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetLatestObservationAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredObservation { Date = DateTime.UtcNow, Value = 5.25 });
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("release API down"));

        var (success, errors) = await _service.FetchAllIndicatorsAsync();

        // Release info failure is caught and doesn't count as error
        Assert.Equal(1, success);
        Assert.Equal(0, errors);
    }
}
```

**Step 2: Run tests**

```bash
dotnet test --filter "FullyQualifiedName~FredFetchServiceTests" --verbosity normal
```

**Step 3: Commit**

```bash
git add tests/DataFetcher.Worker.Tests/FredFetchServiceTests.cs
git commit -m "test: add FredFetchService unit tests"
```

---

## Task 3: FredCalendarSyncServiceTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/FredCalendarSyncServiceTests.cs`
- Reference: `src/DataFetcher.Worker/Application/Providers/Fred/FredCalendarSyncService.cs`

**Step 1: Write tests**

```csharp
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
    private readonly Mock<IFredApiClient> _apiClientMock = new();
    private readonly Mock<IFredRepository> _repoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();
    private readonly Mock<ILogger<FredCalendarSyncService>> _loggerMock = new();
    private readonly FredCalendarSyncService _service;

    public FredCalendarSyncServiceTests()
    {
        _service = new FredCalendarSyncService(
            _apiClientMock.Object, _repoMock.Object,
            _metricsMock.Object, _loggerMock.Object);
    }

    [Fact]
    public async Task SyncCalendar_NoIndicators_ReturnsZeros()
    {
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync())
            .ReturnsAsync(new List<EconomicIndicator>());

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(0, success);
        Assert.Equal(0, errors);
    }

    [Fact]
    public async Task SyncCalendar_Success_UpsertsCalendarEntry()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "FEDFUNDS", DisplayMode = "rate" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("FEDFUNDS", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredReleaseInfo { ReleaseId = 10, ReleaseName = "H.15" });
        _apiClientMock.Setup(a => a.GetReleaseDatesAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FredReleaseDate>
            {
                new() { ReleaseId = 10, Date = DateTime.UtcNow.AddDays(7) },
                new() { ReleaseId = 10, Date = DateTime.UtcNow.AddDays(37) }
            });

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
        _repoMock.Verify(r => r.UpsertReleaseCalendarAsync(It.Is<ReleaseCalendarEntry>(
            e => e.SeriesId == "FEDFUNDS" && e.ReleaseName == "H.15")), Times.Once);
    }

    [Fact]
    public async Task SyncCalendar_NoRelease_CountsAsError()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "UNKNOWN", DisplayMode = "rate" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("UNKNOWN", It.IsAny<CancellationToken>()))
            .ReturnsAsync((FredReleaseInfo?)null);

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(0, success);
        Assert.Equal(1, errors);
    }

    [Fact]
    public async Task SyncCalendar_ApiThrows_CountsAsErrorContinues()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "BAD", DisplayMode = "rate" },
            new() { SeriesId = "GOOD", DisplayMode = "rate" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("BAD", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("timeout"));
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("GOOD", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredReleaseInfo { ReleaseId = 20, ReleaseName = "GDP" });
        _apiClientMock.Setup(a => a.GetReleaseDatesAsync(20, It.IsAny<CancellationToken>()))
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
            new() { SeriesId = "A", DisplayMode = "rate" },
            new() { SeriesId = "B", DisplayMode = "rate" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredReleaseInfo { ReleaseId = 10, ReleaseName = "Shared" });
        _apiClientMock.Setup(a => a.GetReleaseDatesAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FredReleaseDate>());

        await _service.SyncCalendarAsync();

        // Release dates should be fetched only once for shared release ID
        _apiClientMock.Verify(a => a.GetReleaseDatesAsync(10, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SyncCalendar_ReleaseDatesFail_StillSucceedsWithEmptyDates()
    {
        var indicators = new List<EconomicIndicator>
        {
            new() { SeriesId = "X", DisplayMode = "rate" }
        };
        _repoMock.Setup(r => r.GetActiveIndicatorsAsync()).ReturnsAsync(indicators);
        _apiClientMock.Setup(a => a.GetSeriesReleaseAsync("X", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FredReleaseInfo { ReleaseId = 5, ReleaseName = "Test" });
        _apiClientMock.Setup(a => a.GetReleaseDatesAsync(5, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("dates API down"));

        var (success, errors) = await _service.SyncCalendarAsync();

        Assert.Equal(1, success);
        Assert.Equal(0, errors);
    }
}
```

**Step 2: Run and commit** (same pattern as above)

---

## Task 4: FredApiClientTests (Static Methods)

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/FredApiClientTests.cs`
- Reference: `src/DataFetcher.Worker/Infrastructure/Providers/Fred/FredApiClient.cs`

**Why:** `GetReleaseFrequency` is a static pure function — test it without HTTP.

**Step 1: Write tests**

```csharp
using DataFetcher.Worker.Domain.Providers.Fred.Models;
using DataFetcher.Worker.Infrastructure.Providers.Fred;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FredApiClientTests
{
    [Fact]
    public void GetReleaseFrequency_LessThanTwo_ReturnsUnknown()
    {
        var dates = new List<FredReleaseDate> { new() { Date = DateTime.UtcNow } };
        Assert.Equal("Unknown", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_MonthlyDates_ReturnsMonthly()
    {
        var dates = new List<FredReleaseDate>
        {
            new() { Date = new DateTime(2026, 1, 1) },
            new() { Date = new DateTime(2026, 2, 1) },
            new() { Date = new DateTime(2026, 3, 1) }
        };
        Assert.Equal("Monthly", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_WeeklyDates_ReturnsWeekly()
    {
        var dates = new List<FredReleaseDate>
        {
            new() { Date = new DateTime(2026, 3, 1) },
            new() { Date = new DateTime(2026, 3, 8) },
            new() { Date = new DateTime(2026, 3, 15) }
        };
        Assert.Equal("Weekly", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_QuarterlyDates_ReturnsQuarterly()
    {
        var dates = new List<FredReleaseDate>
        {
            new() { Date = new DateTime(2026, 1, 1) },
            new() { Date = new DateTime(2026, 4, 1) },
            new() { Date = new DateTime(2026, 7, 1) }
        };
        Assert.Equal("Quarterly", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_DailyDates_ReturnsDaily()
    {
        var dates = new List<FredReleaseDate>
        {
            new() { Date = new DateTime(2026, 3, 10) },
            new() { Date = new DateTime(2026, 3, 11) },
            new() { Date = new DateTime(2026, 3, 12) }
        };
        Assert.Equal("Daily", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_EmptyList_ReturnsUnknown()
    {
        Assert.Equal("Unknown", FredApiClient.GetReleaseFrequency(new List<FredReleaseDate>()));
    }
}
```

---

## Task 5: SchedulesControllerTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/SchedulesControllerTests.cs`
- Reference: `src/DataFetcher.Worker/Presentation/Controllers/SchedulesController.cs`

**Why:** New discovery endpoint — must verify correct response shape, mapping logic, toggle behavior.

**Step 1: Write tests**

```csharp
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class SchedulesControllerTests
{
    private readonly Mock<IFetchScheduleRepository> _repoMock = new();
    private readonly SchedulesController _controller;

    public SchedulesControllerTests()
    {
        _controller = new SchedulesController(_repoMock.Object);
    }

    [Fact]
    public async Task GetAll_ReturnsServiceNameAndScheduleList()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { Id = 1, Name = "Test Schedule", IsEnabled = true, IntervalMinutes = 30, OffsetMinutes = 5 }
            }.AsReadOnly());

        var result = await _controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = ok.Value as ScheduleDiscoveryResponse;
        Assert.NotNull(response);
        Assert.Equal("data-fetcher-2.0", response!.Service);
        Assert.Single(response.Schedules);
        Assert.Equal("Test Schedule", response.Schedules[0].Name);
    }

    [Fact]
    public async Task GetAll_IntervalSchedule_MapsCadenceCorrectly()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { Id = 1, Name = "Interval", IntervalMinutes = 30, OffsetMinutes = 5, IsEnabled = true }
            }.AsReadOnly());

        var result = await _controller.GetAll();

        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        var schedule = response!.Schedules[0];
        Assert.Equal("interval", schedule.CadenceType);
        Assert.Equal(30, schedule.IntervalMinutes);
        Assert.Equal(5, schedule.OffsetMinutes);
        Assert.Null(schedule.ScheduleTime);
    }

    [Fact]
    public async Task GetAll_DailySchedule_MapsCadenceCorrectly()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new()
                {
                    Id = 2, Name = "Daily", IntervalMinutes = null,
                    ScheduleTime = TimeSpan.FromHours(8), ScheduleTimezone = "America/New_York",
                    IsEnabled = true
                }
            }.AsReadOnly());

        var result = await _controller.GetAll();

        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        var schedule = response!.Schedules[0];
        Assert.Equal("daily", schedule.CadenceType);
        Assert.Equal("08:00:00", schedule.ScheduleTime);
        Assert.Equal("America/New_York", schedule.ScheduleTimezone);
        Assert.Null(schedule.IntervalMinutes);
    }

    [Fact]
    public async Task Toggle_ScheduleExists_ReturnsOkWithToggleResponse()
    {
        _repoMock.Setup(r => r.ToggleScheduleAsync(1))
            .ReturnsAsync(new FetchSchedule { Id = 1, Name = "Test", IsEnabled = false });

        var result = await _controller.Toggle(1);

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = ok.Value as ScheduleToggleResponse;
        Assert.NotNull(response);
        Assert.False(response!.IsEnabled);
        Assert.Contains("disabled", response.Message);
    }

    [Fact]
    public async Task Toggle_ScheduleNotFound_Returns404()
    {
        _repoMock.Setup(r => r.ToggleScheduleAsync(999))
            .ReturnsAsync((FetchSchedule?)null);

        var result = await _controller.Toggle(999);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task GetAll_EmptySchedules_ReturnsEmptyList()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>().AsReadOnly());

        var result = await _controller.GetAll();

        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        Assert.NotNull(response);
        Assert.Empty(response!.Schedules);
    }
}
```

---

## Task 6: FredControllerTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/FredControllerTests.cs`
- Reference: `src/DataFetcher.Worker/Presentation/Controllers/FredController.cs`

**Why:** Verifies new FRED endpoints, including error handling paths.

**Note:** FredController uses `IServiceProvider.CreateScope()` for DI. We need to set up mock `IServiceProvider` → `IServiceScope` → `IServiceProvider` chain.

**Step 1: Write tests**

```csharp
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
    private readonly Mock<IFredFetchService> _fetchServiceMock = new();
    private readonly Mock<IFredCalendarSyncService> _syncServiceMock = new();
    private readonly Mock<IFredRepository> _repoMock = new();
    private readonly FredController _controller;

    public FredControllerTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_fetchServiceMock.Object);
        services.AddSingleton(_syncServiceMock.Object);
        services.AddSingleton(_repoMock.Object);
        var provider = services.BuildServiceProvider();

        _controller = new FredController(provider, Mock.Of<ILogger<FredController>>());
    }

    [Fact]
    public async Task GetStatus_ReturnsOkWithIndicators()
    {
        _repoMock.Setup(r => r.GetAllIndicatorStatusAsync())
            .ReturnsAsync(new List<IndicatorStatus>
            {
                new() { SeriesId = "FEDFUNDS", DisplayName = "Fed Rate", Category = "rates" }
            });

        var result = await _controller.GetStatus(null);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task TriggerAll_Success_ReturnsOkWithCounts()
    {
        _fetchServiceMock.Setup(s => s.FetchAllIndicatorsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((3, 0));

        var result = await _controller.TriggerAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task TriggerAll_ServiceThrows_Returns500()
    {
        _fetchServiceMock.Setup(s => s.FetchAllIndicatorsAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("DB down"));

        var result = await _controller.TriggerAll(CancellationToken.None);

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, status.StatusCode);
    }

    [Fact]
    public async Task TriggerSingle_NotFound_Returns404()
    {
        _fetchServiceMock.Setup(s => s.FetchSingleIndicatorAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException("not found"));

        var result = await _controller.TriggerSingle("MISSING", CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task TriggerSingle_ServiceThrows_Returns500()
    {
        _fetchServiceMock.Setup(s => s.FetchSingleIndicatorAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("timeout"));

        var result = await _controller.TriggerSingle("FEDFUNDS", CancellationToken.None);

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, status.StatusCode);
    }

    [Fact]
    public async Task GetCalendar_NoDaysParam_ReturnsAll()
    {
        _repoMock.Setup(r => r.GetAllReleaseCalendarAsync())
            .ReturnsAsync(new List<ReleaseCalendarEntry>());

        var result = await _controller.GetCalendar(null);

        Assert.IsType<OkObjectResult>(result);
        _repoMock.Verify(r => r.GetAllReleaseCalendarAsync(), Times.Once);
        _repoMock.Verify(r => r.GetUpcomingReleasesAsync(It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task GetCalendar_WithDays_FiltersUpcoming()
    {
        _repoMock.Setup(r => r.GetUpcomingReleasesAsync(30))
            .ReturnsAsync(new List<ReleaseCalendarEntry>());

        var result = await _controller.GetCalendar(30);

        Assert.IsType<OkObjectResult>(result);
        _repoMock.Verify(r => r.GetUpcomingReleasesAsync(30), Times.Once);
    }

    [Fact]
    public async Task SyncCalendar_Success_ReturnsOk()
    {
        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((5, 1));

        var result = await _controller.SyncCalendar(CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }
}
```

---

## Task 7: FredFetchWorkerTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/FredFetchWorkerTests.cs`
- Reference: `src/DataFetcher.Worker/Workers/Fred/FredFetchWorker.cs`

**Why:** Verifies worker handles disabled schedules, missing schedules, and logs execution.

**Note:** Workers use `BackgroundService.ExecuteAsync` with infinite loops. We test by using `CancellationToken` to cancel after the first iteration.

**Step 1: Write tests**

```csharp
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Fred;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FredFetchWorkerTests
{
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<IFredFetchService> _fetchServiceMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private FredFetchWorker CreateWorker()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_scheduleRepoMock.Object);
        services.AddSingleton(_fetchServiceMock.Object);
        var provider = services.BuildServiceProvider();

        return new FredFetchWorker(
            provider,
            Mock.Of<ILogger<FredFetchWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_NoSchedule_WaitsAndRetries()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("FRED Daily Macro Fetch"))
            .ReturnsAsync((FetchSchedule?)null);

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        // Worker should not throw when no schedule found — it should loop gracefully
        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        await worker.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task ExecuteAsync_DisabledSchedule_WaitsAndRetries()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("FRED Daily Macro Fetch"))
            .ReturnsAsync(new FetchSchedule { Id = 4, Name = "FRED Daily Macro Fetch", IsEnabled = false });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        await worker.StopAsync(CancellationToken.None);

        _fetchServiceMock.Verify(
            s => s.FetchAllIndicatorsAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_CancellationBeforeDelay_StopsGracefully()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("FRED Daily Macro Fetch"))
            .ReturnsAsync(new FetchSchedule
            {
                Id = 4, Name = "FRED Daily Macro Fetch", IsEnabled = true,
                ScheduleTime = TimeSpan.FromHours(23), ScheduleTimezone = "UTC"
            });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);

        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_ReportsMetricsOnStartAndStop()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("FRED Daily Macro Fetch"))
            .ReturnsAsync((FetchSchedule?)null);

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));

        await worker.StartAsync(cts.Token);
        await Task.Delay(500);
        await worker.StopAsync(CancellationToken.None);

        _metricsMock.Verify(m => m.SetGaugeAsync(
            "data_fetcher_2_fred_fetch_worker_up", 1, null), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_FetchServiceThrows_DoesNotCrashWorker()
    {
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("FRED Daily Macro Fetch"))
            .ThrowsAsync(new Exception("DB connection failed"));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);

        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
```

---

## Task 8: FredCalendarSyncWorkerTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/FredCalendarSyncWorkerTests.cs`
- Reference: `src/DataFetcher.Worker/Workers/Fred/FredCalendarSyncWorker.cs`

**Step 1: Write tests**

```csharp
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Workers.Fred;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FredCalendarSyncWorkerTests
{
    private readonly Mock<IFredCalendarSyncService> _syncServiceMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();

    private FredCalendarSyncWorker CreateWorker()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_syncServiceMock.Object);
        var provider = services.BuildServiceProvider();

        return new FredCalendarSyncWorker(
            provider,
            Mock.Of<ILogger<FredCalendarSyncWorker>>(),
            _metricsMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_RunsInitialSyncOnStartup()
    {
        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((5, 0));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1500);
        await worker.StopAsync(CancellationToken.None);

        _syncServiceMock.Verify(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_SyncThrows_DoesNotCrashWorker()
    {
        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("DB down"));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);

        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_ReportsMetrics()
    {
        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((3, 0));

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1500);
        await worker.StopAsync(CancellationToken.None);

        _metricsMock.Verify(m => m.IncrementCounterAsync(
            "data_fetcher_2_fred_calendar_sync_total", 1,
            It.IsAny<Dictionary<string, string>>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_CancellationDuringSync_StopsGracefully()
    {
        _syncServiceMock.Setup(s => s.SyncCalendarAsync(It.IsAny<CancellationToken>()))
            .Returns(async (CancellationToken ct) =>
            {
                await Task.Delay(5000, ct);
                return (0, 0);
            });

        var worker = CreateWorker();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);

        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
```

---

## Task 9: AlpacaStockFetchWorkerTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/AlpacaStockFetchWorkerTests.cs`
- Reference: `src/DataFetcher.Worker/Workers/Alpaca/AlpacaStockFetchWorker.cs`

**Why:** Most-used worker — validates interval loop, error resilience, metrics reporting.

**Step 1: Write tests** (similar pattern to FredFetchWorkerTests but with AlpacaSettings)

```csharp
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Workers.Alpaca;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class AlpacaStockFetchWorkerTests
{
    private readonly Mock<IAlpacaStockFetchService> _fetchServiceMock = new();
    private readonly Mock<IFetchScheduleRepository> _scheduleRepoMock = new();
    private readonly Mock<IMetricsClient> _metricsMock = new();
    private readonly Mock<IGatewayAlertNotifier> _alertMock = new();

    private AlpacaStockFetchWorker CreateWorker(int intervalMinutes = 30)
    {
        var services = new ServiceCollection();
        services.AddSingleton(_fetchServiceMock.Object);
        services.AddSingleton(_scheduleRepoMock.Object);
        var provider = services.BuildServiceProvider();

        return new AlpacaStockFetchWorker(
            provider,
            Options.Create(new AlpacaSettings { FetchIntervalMinutes = intervalMinutes }),
            Mock.Of<ILogger<AlpacaStockFetchWorker>>(),
            _metricsMock.Object,
            _alertMock.Object);
    }

    [Fact]
    public async Task ExecuteAsync_FetchesOnFirstLoop()
    {
        _fetchServiceMock.Setup(s => s.FetchLatestStockDataAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(10);
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Alpaca Stock Fetch"))
            .ReturnsAsync(new FetchSchedule { Id = 1 });

        var worker = CreateWorker(intervalMinutes: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

        await worker.StartAsync(cts.Token);
        await Task.Delay(2000);
        await worker.StopAsync(CancellationToken.None);

        _fetchServiceMock.Verify(s => s.FetchLatestStockDataAsync(
            It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_FetchThrows_DoesNotCrashWorker()
    {
        _fetchServiceMock.Setup(s => s.FetchLatestStockDataAsync(It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("API down"));
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Alpaca Stock Fetch"))
            .ReturnsAsync(new FetchSchedule { Id = 1 });

        var worker = CreateWorker(intervalMinutes: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);

        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_FetchThrows_LogsExecutionAsFailed()
    {
        _fetchServiceMock.Setup(s => s.FetchLatestStockDataAsync(It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("timeout"));
        _scheduleRepoMock.Setup(r => r.GetScheduleByNameAsync("Alpaca Stock Fetch"))
            .ReturnsAsync(new FetchSchedule { Id = 1 });

        var worker = CreateWorker(intervalMinutes: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

        await worker.StartAsync(cts.Token);
        await Task.Delay(2000);
        await worker.StopAsync(CancellationToken.None);

        _scheduleRepoMock.Verify(r => r.UpdateLastRunAsync(1, "failed", It.IsAny<string>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_CancellationDuringFetch_StopsGracefully()
    {
        _fetchServiceMock.Setup(s => s.FetchLatestStockDataAsync(It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Returns(async (DateTime? _, CancellationToken ct) =>
            {
                await Task.Delay(10000, ct);
                return 0;
            });

        var worker = CreateWorker(intervalMinutes: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);

        var ex = await Record.ExceptionAsync(() => worker.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }
}
```

---

## Task 10: ScheduleDiscoveryMappingTests

**Files:**
- Test: `tests/DataFetcher.Worker.Tests/ScheduleDiscoveryMappingTests.cs`

**Why:** Validates edge cases in the schedule-to-DTO mapping that the controller delegates to.

**Step 1: Write tests**

```csharp
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Presentation.Controllers;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class ScheduleDiscoveryMappingTests
{
    private readonly Mock<IFetchScheduleRepository> _repoMock = new();
    private readonly SchedulesController _controller;

    public ScheduleDiscoveryMappingTests()
    {
        _controller = new SchedulesController(_repoMock.Object);
    }

    [Fact]
    public async Task Mapping_ZeroIntervalMinutes_TreatedAsDaily()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { IntervalMinutes = 0, ScheduleTime = TimeSpan.FromHours(8), ScheduleTimezone = "UTC", IsEnabled = true }
            }.AsReadOnly());

        var result = await _controller.GetAll();
        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        Assert.Equal("daily", response!.Schedules[0].CadenceType);
    }

    [Fact]
    public async Task Mapping_NullIntervalMinutes_TreatedAsDaily()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { IntervalMinutes = null, ScheduleTime = TimeSpan.FromHours(14), ScheduleTimezone = "America/New_York", IsEnabled = true }
            }.AsReadOnly());

        var result = await _controller.GetAll();
        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        Assert.Equal("daily", response!.Schedules[0].CadenceType);
    }

    [Fact]
    public async Task Mapping_PreservesLastRunFields()
    {
        var lastRunAt = new DateTime(2026, 3, 13, 10, 0, 0, DateTimeKind.Utc);
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new()
                {
                    IntervalMinutes = 30, IsEnabled = true,
                    LastRunAt = lastRunAt, LastRunStatus = "success", LastRunMessage = "OK"
                }
            }.AsReadOnly());

        var result = await _controller.GetAll();
        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        var schedule = response!.Schedules[0];
        Assert.Equal(lastRunAt, schedule.LastRunAt);
        Assert.Equal("success", schedule.LastRunStatus);
        Assert.Equal("OK", schedule.LastRunMessage);
    }

    [Fact]
    public async Task Mapping_DisabledSchedule_PreservesIsEnabledFalse()
    {
        _repoMock.Setup(r => r.GetAllSchedulesAsync())
            .ReturnsAsync(new List<FetchSchedule>
            {
                new() { IntervalMinutes = 30, IsEnabled = false }
            }.AsReadOnly());

        var result = await _controller.GetAll();
        var response = (result as OkObjectResult)?.Value as ScheduleDiscoveryResponse;
        Assert.False(response!.Schedules[0].IsEnabled);
    }
}
```

---

## Task 11: Add Missing Try-Catch to Controllers

**Files to modify:**
- `src/DataFetcher.Worker/Presentation/Controllers/SchedulesController.cs`
- `src/DataFetcher.Worker/Presentation/Controllers/FredController.cs` (`GetStatus`, `GetCalendar`)

**Why:** Endpoints without try-catch will return unformatted 500s or crash on DB errors. The audit found 15+ endpoints missing error handling across all controllers. Fix the new/modified ones first; the rest can be tracked separately.

**Step 1: Add try-catch to SchedulesController.GetAll**

Wrap the body in:
```csharp
try { ... existing code ... }
catch (Exception ex)
{
    _logger.LogError(ex, "Error fetching schedules");
    return StatusCode(500, new { message = "Failed to fetch schedules", error = ex.Message });
}
```

This requires adding `ILogger<SchedulesController>` to the constructor.

**Step 2: Add try-catch to SchedulesController.Toggle**

Same pattern, catch and return 500.

**Step 3: Add try-catch to FredController.GetStatus and FredController.GetCalendar**

Same pattern.

**Step 4: Run all tests to verify nothing broke**

```bash
dotnet test --verbosity normal
```

**Step 5: Commit**

```bash
git add src/DataFetcher.Worker/Presentation/Controllers/SchedulesController.cs
git add src/DataFetcher.Worker/Presentation/Controllers/FredController.cs
git commit -m "fix: add try-catch to SchedulesController and FredController endpoints"
```

---

## Final Verification

```bash
cd services/workers/data-fetcher-2.0
dotnet test --verbosity normal
```

Expected: ~113 tests (54 existing + ~59 new), all passing.

---

## Workflow

1. Baseline check (SSH into VM)
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → Note current image version

2. Stage and push changes
   - `git status` → `git add <file1> <file2> ...` → `git commit -m "msg" && git push origin main`
   - Never use `git add .` — other agents may have uncommitted changes

3. Verify build
   - GitHub Actions: `gh run watch`
   - If frontend modified: `vercel ls --scope=stocktracker`
   - **Only proceed when all builds pass**
   - Build fails → `gh run view <run-id> --log` or `vercel logs <url>` → Fix → Step 2

4. Verify VM deployment
   - SSH → `docker ps` → Compare version
   - Version incremented → Done
   - Version unchanged / container down → Fix → Step 2

5. Done
