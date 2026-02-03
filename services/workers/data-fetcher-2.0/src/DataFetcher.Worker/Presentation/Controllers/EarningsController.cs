using DataFetcher.Worker.Application.Scheduling;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for earnings synchronization operations.
/// Combines Alpha Vantage (upcoming dates) and Finnhub (historical actuals).
/// </summary>
[ApiController]
[Route("api/earnings")]
[Produces("application/json")]
public class EarningsController : ControllerBase
{
    private readonly IEarningsSyncService _earningsSyncService;
    private readonly IFetchScheduleRepository _scheduleRepo;
    private readonly ILogger<EarningsController> _logger;

    public EarningsController(
        IEarningsSyncService earningsSyncService,
        IFetchScheduleRepository scheduleRepo,
        ILogger<EarningsController> logger)
    {
        _earningsSyncService = earningsSyncService;
        _scheduleRepo = scheduleRepo;
        _logger = logger;
    }

    /// <summary>
    /// Gets the earnings sync service status.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(EarningsSyncStatusResponse), 200)]
    public async Task<IActionResult> GetStatus()
    {
        var schedule = await _scheduleRepo.GetScheduleByNameAsync("Monthly Earnings Sync");

        return Ok(new EarningsSyncStatusResponse
        {
            Service = "EarningsSync",
            Description = "Combines Alpha Vantage (upcoming dates) + Finnhub (historical actuals)",
            Status = schedule?.IsEnabled == true ? "Enabled" : "Disabled",
            Schedule = schedule != null ? new ScheduleSummary
            {
                Name = schedule.Name,
                ScheduleTime = schedule.ScheduleTime.ToString(@"hh\:mm\:ss"),
                ScheduleTimezone = schedule.ScheduleTimezone,
                IsEnabled = schedule.IsEnabled,
                LastRunAt = schedule.LastRunAt,
                LastRunStatus = schedule.LastRunStatus,
                LastRunMessage = schedule.LastRunMessage
            } : null
        });
    }

    /// <summary>
    /// Manually triggers earnings sync for all active tickers.
    /// </summary>
    [HttpPost("sync")]
    [ProducesResponseType(typeof(EarningsSyncResponse), 200)]
    public async Task<IActionResult> TriggerSyncAll(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger for earnings sync (all tickers)");

        try
        {
            var result = await _earningsSyncService.SyncAllTickersAsync(cancellationToken);

            // Update schedule last run if exists
            var schedule = await _scheduleRepo.GetScheduleByNameAsync("Monthly Earnings Sync");
            if (schedule != null)
            {
                var message = $"Manual sync: {result.RecordsUpserted} records for {result.SuccessCount}/{result.TotalTickers} tickers";
                await _scheduleRepo.UpdateLastRunAsync(schedule.Id, "completed", message);
            }

            return Ok(new EarningsSyncResponse
            {
                Success = true,
                Message = $"Synced {result.RecordsUpserted} earnings records for {result.SuccessCount}/{result.TotalTickers} tickers",
                TotalTickers = result.TotalTickers,
                SuccessCount = result.SuccessCount,
                ErrorCount = result.ErrorCount,
                RecordsUpserted = result.RecordsUpserted,
                DurationSeconds = result.Duration.TotalSeconds,
                Errors = result.Errors
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual earnings sync");
            return Ok(new EarningsSyncResponse
            {
                Success = false,
                Message = $"Error: {ex.Message}",
                Errors = new List<string> { ex.Message }
            });
        }
    }

    /// <summary>
    /// Manually triggers earnings sync for a specific ticker.
    /// </summary>
    [HttpPost("sync/{symbol}")]
    [ProducesResponseType(typeof(EarningsSyncResponse), 200)]
    public async Task<IActionResult> TriggerSyncBySymbol(string symbol, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger for earnings sync for {Symbol}", symbol);

        try
        {
            var count = await _earningsSyncService.SyncTickerAsync(symbol, cancellationToken);

            return Ok(new EarningsSyncResponse
            {
                Success = true,
                Message = $"Synced {count} earnings records for {symbol}",
                TotalTickers = 1,
                SuccessCount = 1,
                RecordsUpserted = count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during earnings sync for {Symbol}", symbol);
            return Ok(new EarningsSyncResponse
            {
                Success = false,
                Message = $"Error syncing {symbol}: {ex.Message}",
                Errors = new List<string> { ex.Message }
            });
        }
    }
}

/// <summary>
/// Earnings sync service status response.
/// </summary>
public class EarningsSyncStatusResponse
{
    public string Service { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public ScheduleSummary? Schedule { get; set; }
}

/// <summary>
/// Schedule summary info.
/// </summary>
public class ScheduleSummary
{
    public string Name { get; set; } = string.Empty;
    public string ScheduleTime { get; set; } = string.Empty;
    public string ScheduleTimezone { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
    public string? LastRunMessage { get; set; }
}

/// <summary>
/// Earnings sync response.
/// </summary>
public class EarningsSyncResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int TotalTickers { get; set; }
    public int SuccessCount { get; set; }
    public int ErrorCount { get; set; }
    public int RecordsUpserted { get; set; }
    public double DurationSeconds { get; set; }
    public List<string> Errors { get; set; } = new();
}
