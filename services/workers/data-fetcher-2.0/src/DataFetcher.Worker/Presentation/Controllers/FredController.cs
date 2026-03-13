using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

[ApiController]
[Route("api/fred")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "fred")]
public class FredController : ControllerBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FredController> _logger;

    public FredController(IServiceProvider serviceProvider, ILogger<FredController> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus([FromQuery] string? display)
    {
        try
        {
            var displayMode = display == "raw" ? "raw" : "media";

            using var scope = _serviceProvider.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IFredRepository>();
            var indicators = await repo.GetAllIndicatorStatusAsync();

            string? lastUpdated = null;
            var dtos = indicators.Select(ind =>
            {
                var dto = new
                {
                    series_id = ind.SeriesId,
                    display_name = ind.DisplayName,
                    category = ind.Category,
                    display_mode = ind.DisplayMode,
                    raw_current_value = ind.CurrentValue,
                    raw_previous_value = ind.PreviousValue,
                    current_value = displayMode == "raw"
                        ? ind.CurrentValue
                        : (ind.MediaCurrentValue ?? ind.CurrentValue),
                    previous_value = displayMode == "raw"
                        ? ind.PreviousValue
                        : (ind.MediaPreviousValue ?? ind.PreviousValue),
                    change_percent = ind.ChangePercent,
                    trend = ind.Trend,
                    signal = ind.CurrentSignal,
                    current_observation_date = ind.CurrentDate?.ToString("yyyy-MM-dd"),
                    last_release_date = ind.LastReleaseDate?.ToString("yyyy-MM-dd")
                };

                if (ind.LastUpdatedAt.HasValue)
                {
                    var formatted = ind.LastUpdatedAt.Value.ToString("o");
                    if (lastUpdated == null || string.CompareOrdinal(formatted, lastUpdated) > 0)
                        lastUpdated = formatted;
                }

                return dto;
            }).ToList();

            return Ok(new
            {
                service = "fred-worker",
                status = "Running",
                display = displayMode,
                indicator_count = indicators.Count,
                last_updated_at = lastUpdated,
                indicators = dtos
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetStatus");
            return StatusCode(500, new { message = "Failed to retrieve FRED status", error = ex.Message });
        }
    }

    [HttpPost("trigger/all")]
    public async Task<IActionResult> TriggerAll(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger: all FRED indicators");

        using var scope = _serviceProvider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IFredFetchService>();

        try
        {
            var (successCount, errorCount) = await service.FetchAllIndicatorsAsync(cancellationToken);
            return Ok(new
            {
                success = true,
                message = $"Fetched {successCount} indicators, {errorCount} errors",
                records_processed = successCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FRED trigger all failed");
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("trigger/{seriesId}")]
    public async Task<IActionResult> TriggerSingle(string seriesId, CancellationToken cancellationToken)
    {
        seriesId = seriesId.ToUpperInvariant();
        _logger.LogInformation("Manual trigger: single FRED indicator {SeriesId}", seriesId);

        using var scope = _serviceProvider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IFredFetchService>();

        try
        {
            await service.FetchSingleIndicatorAsync(seriesId, cancellationToken);
            return Ok(new { success = true, message = "Indicator updated", records_processed = 1 });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { success = false, message = $"Indicator {seriesId} not found" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FRED trigger single failed for {SeriesId}", seriesId);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("calendar")]
    public async Task<IActionResult> GetCalendar([FromQuery] int? days)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IFredRepository>();

            var entries = days.HasValue && days.Value > 0
                ? await repo.GetUpcomingReleasesAsync(days.Value)
                : await repo.GetAllReleaseCalendarAsync();

            var dtos = entries.Select(e => new
            {
                series_id = e.SeriesId,
                release_name = e.ReleaseName,
                next_release_date = e.NextReleaseDate?.ToString("yyyy-MM-dd"),
                following_release_date = e.FollowingReleaseDate?.ToString("yyyy-MM-dd"),
                release_frequency = e.ReleaseFrequency,
                release_link = e.ReleaseLink
            }).ToList();

            return Ok(new { releases = dtos, count = dtos.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetCalendar");
            return StatusCode(500, new { message = "Failed to retrieve FRED calendar", error = ex.Message });
        }
    }

    [HttpPost("calendar/sync")]
    public async Task<IActionResult> SyncCalendar(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger: FRED calendar sync");

        using var scope = _serviceProvider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IFredCalendarSyncService>();

        try
        {
            var (successCount, errorCount) = await service.SyncCalendarAsync(cancellationToken);
            return Ok(new
            {
                success = true,
                message = $"Calendar sync completed: {successCount} success, {errorCount} errors"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FRED calendar sync failed");
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }
}
