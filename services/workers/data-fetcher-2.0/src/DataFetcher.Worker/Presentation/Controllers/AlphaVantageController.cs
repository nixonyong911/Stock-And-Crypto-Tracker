using DataFetcher.Worker.Application.Providers.AlphaVantage;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for Alpha Vantage earnings calendar operations.
/// </summary>
[ApiController]
[Route("api/alphavantage")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "alphavantage")]
public class AlphaVantageController : ControllerBase
{
    private readonly IEarningsCalendarService _earningsService;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IFetchScheduleRepository _scheduleRepo;
    private readonly AlphaVantageSettings _settings;
    private readonly ILogger<AlphaVantageController> _logger;

    public AlphaVantageController(
        IEarningsCalendarService earningsService,
        IStockTickerRepository tickerRepo,
        IFetchScheduleRepository scheduleRepo,
        IOptions<AlphaVantageSettings> settings,
        ILogger<AlphaVantageController> logger)
    {
        _earningsService = earningsService;
        _tickerRepo = tickerRepo;
        _scheduleRepo = scheduleRepo;
        _settings = settings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Gets the Alpha Vantage provider status and configuration.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(AlphaVantageStatusResponse), 200)]
    public async Task<IActionResult> GetStatus()
    {
        try
        {
            var schedule = await _scheduleRepo.GetScheduleByDataSourceNameAsync("AlphaVantage");
            var tickers = await _tickerRepo.GetActiveTickersAsync();

            return Ok(new AlphaVantageStatusResponse
            {
                Provider = "AlphaVantage",
                Status = schedule?.IsEnabled == true ? "Running" : "Disabled",
                Config = new AlphaVantageConfigInfo
                {
                    BaseUrl = _settings.BaseUrl,
                    RateLimitDelayMs = _settings.RateLimitDelayMs,
                    Horizon = _settings.Horizon,
                    HasApiKey = !string.IsNullOrEmpty(_settings.ApiKey)
                },
                ActiveTickers = tickers.Count(),
                Schedule = schedule != null ? new ScheduleInfo
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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetStatus");
            return StatusCode(500, new { message = "Failed to retrieve AlphaVantage status", error = ex.Message });
        }
    }

    /// <summary>
    /// Manually triggers an earnings calendar sync for all tickers.
    /// </summary>
    [HttpPost("earnings/sync")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    public async Task<IActionResult> TriggerSyncAll(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger for earnings calendar sync (all tickers)");

        try
        {
            var count = await _earningsService.SyncAllEarningsCalendarAsync(cancellationToken);
            return Ok(new TriggerResponse
            {
                Success = true,
                Message = $"Successfully synced {count} earnings events for all tickers",
                RecordsProcessed = count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during earnings calendar sync");
            return Ok(new TriggerResponse
            {
                Success = false,
                Message = $"Error syncing earnings calendar: {ex.Message}",
                RecordsProcessed = 0
            });
        }
    }

    /// <summary>
    /// Manually triggers an earnings calendar sync for a specific symbol.
    /// </summary>
    [HttpPost("earnings/sync/{symbol}")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> TriggerSyncBySymbol(string symbol, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger for earnings calendar sync for {Symbol}", symbol);

        // Validate symbol exists
        var tickers = await _tickerRepo.GetActiveTickersAsync();
        var ticker = tickers.FirstOrDefault(t =>
            t.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));

        if (ticker == null)
        {
            return NotFound(new { message = $"Ticker '{symbol}' not found in database" });
        }

        try
        {
            var count = await _earningsService.SyncEarningsCalendarBySymbolAsync(symbol, cancellationToken);
            return Ok(new TriggerResponse
            {
                Success = true,
                Message = $"Successfully synced {count} earnings events for {symbol}",
                RecordsProcessed = count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during earnings calendar sync for {Symbol}", symbol);
            return Ok(new TriggerResponse
            {
                Success = false,
                Message = $"Error syncing earnings calendar for {symbol}: {ex.Message}",
                RecordsProcessed = 0
            });
        }
    }
}

/// <summary>
/// Alpha Vantage provider status response.
/// </summary>
public class AlphaVantageStatusResponse
{
    public string Provider { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public AlphaVantageConfigInfo Config { get; set; } = new();
    public int ActiveTickers { get; set; }
    public ScheduleInfo? Schedule { get; set; }
}

/// <summary>
/// Alpha Vantage configuration info.
/// </summary>
public class AlphaVantageConfigInfo
{
    public string BaseUrl { get; set; } = string.Empty;
    public int RateLimitDelayMs { get; set; }
    public string Horizon { get; set; } = string.Empty;
    public bool HasApiKey { get; set; }
}
