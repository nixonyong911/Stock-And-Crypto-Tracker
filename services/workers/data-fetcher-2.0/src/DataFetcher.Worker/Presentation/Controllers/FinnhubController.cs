using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for Finnhub fundamentals fetch operations.
/// Note: Earnings calendar functionality has been moved to AlphaVantage provider.
/// </summary>
[ApiController]
[Route("api/finnhub")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "finnhub")]
public class FinnhubController : ControllerBase
{
    private readonly IFundamentalsFetchService _fundamentalsService;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IFetchScheduleRepository _scheduleRepo;
    private readonly FinnhubSettings _settings;
    private readonly ILogger<FinnhubController> _logger;

    public FinnhubController(
        IFundamentalsFetchService fundamentalsService,
        IStockTickerRepository tickerRepo,
        IFetchScheduleRepository scheduleRepo,
        IOptions<FinnhubSettings> settings,
        ILogger<FinnhubController> logger)
    {
        _fundamentalsService = fundamentalsService;
        _tickerRepo = tickerRepo;
        _scheduleRepo = scheduleRepo;
        _settings = settings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Gets the Finnhub provider status and configuration.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(FinnhubStatusResponse), 200)]
    public async Task<IActionResult> GetStatus()
    {
        try
        {
            var schedule = await _scheduleRepo.GetScheduleByDataSourceNameAsync("Finnhub");

            return Ok(new FinnhubStatusResponse
            {
                Provider = "Finnhub",
                Status = schedule?.IsEnabled == true ? "Running" : "Disabled",
                Config = new FinnhubConfigInfo
                {
                    BaseUrl = _settings.BaseUrl,
                    RateLimitDelayMs = _settings.RateLimitDelayMs,
                    HasApiKey = !string.IsNullOrEmpty(_settings.ApiKey)
                },
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
            return StatusCode(500, new { message = "Failed to retrieve Finnhub status", error = ex.Message });
        }
    }

    /// <summary>
    /// Manually triggers a fundamentals fetch for a single ticker.
    /// </summary>
    [HttpPost("trigger/{tickerId:int}")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> TriggerSingle(int tickerId, CancellationToken cancellationToken)
    {
        var ticker = await _tickerRepo.GetByIdAsync(tickerId);
        if (ticker == null)
        {
            return NotFound(new { message = $"Ticker with ID {tickerId} not found" });
        }

        _logger.LogInformation("Manual trigger for ticker {Symbol} ({Id})", ticker.Symbol, tickerId);

        try
        {
            var result = await _fundamentalsService.FetchAndStoreFundamentalsAsync(ticker, cancellationToken);
            return Ok(new TriggerResponse
            {
                Success = result != null,
                Message = result != null
                    ? $"Successfully fetched fundamentals for {ticker.Symbol}"
                    : $"No data available for {ticker.Symbol}",
                RecordsProcessed = result != null ? 1 : 0
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual trigger for {Symbol}", ticker.Symbol);
            return Ok(new TriggerResponse
            {
                Success = false,
                Message = $"Error fetching fundamentals for {ticker.Symbol}: {ex.Message}",
                RecordsProcessed = 0
            });
        }
    }

    /// <summary>
    /// Manually triggers a fundamentals fetch for all active tickers.
    /// </summary>
    [HttpPost("trigger/all")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    public async Task<IActionResult> TriggerAll(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger for all tickers");

        try
        {
            var count = await _fundamentalsService.FetchAndStoreAllFundamentalsAsync(cancellationToken);
            return Ok(new TriggerResponse
            {
                Success = true,
                Message = $"Successfully fetched fundamentals for {count} tickers",
                RecordsProcessed = count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual trigger for all tickers");
            return Ok(new TriggerResponse
            {
                Success = false,
                Message = $"Error fetching fundamentals: {ex.Message}",
                RecordsProcessed = 0
            });
        }
    }

    /// <summary>
    /// Manually triggers external indicator fetch for all active tickers.
    /// </summary>
    [HttpPost("external-indicators/trigger/all")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    public async Task<IActionResult> TriggerExternalIndicators(CancellationToken ct)
    {
        _logger.LogInformation("Manual trigger for external indicators (all tickers)");
        try
        {
            var service = HttpContext.RequestServices.GetRequiredService<IFinnhubExternalIndicatorService>();
            var result = await service.FetchAllStockExternalIndicatorsAsync(ct);
            return Ok(new TriggerResponse
            {
                Success = true,
                Message = $"Stocks: {result.SuccessCount}/{result.TotalTickers} ({result.DurationSeconds:F1}s)",
                RecordsProcessed = result.SuccessCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual external indicator trigger");
            return Ok(new TriggerResponse { Success = false, Message = ex.Message });
        }
    }

    /// <summary>
    /// Manually triggers external indicator fetch for a single ticker.
    /// </summary>
    [HttpPost("external-indicators/trigger/{tickerId:int}")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> TriggerExternalIndicatorsSingle(int tickerId, CancellationToken ct)
    {
        var ticker = await _tickerRepo.GetByIdAsync(tickerId);
        if (ticker == null)
            return NotFound(new { message = $"Ticker with ID {tickerId} not found" });

        _logger.LogInformation("Manual trigger for external indicators: {Symbol} ({Id})", ticker.Symbol, tickerId);
        try
        {
            var service = HttpContext.RequestServices.GetRequiredService<IFinnhubExternalIndicatorService>();
            var success = await service.FetchStockExternalIndicatorsAsync(tickerId, ticker.Symbol, ct);
            return Ok(new TriggerResponse
            {
                Success = success,
                Message = success ? $"External indicators fetched for {ticker.Symbol}" : $"Failed for {ticker.Symbol}",
                RecordsProcessed = success ? 1 : 0
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual external indicator trigger for {Symbol}", ticker.Symbol);
            return Ok(new TriggerResponse { Success = false, Message = ex.Message });
        }
    }

}

/// <summary>
/// Finnhub provider status response.
/// </summary>
public class FinnhubStatusResponse
{
    public string Provider { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public FinnhubConfigInfo Config { get; set; } = new();
    public ScheduleInfo? Schedule { get; set; }
}

/// <summary>
/// Finnhub configuration info.
/// </summary>
public class FinnhubConfigInfo
{
    public string BaseUrl { get; set; } = string.Empty;
    public int RateLimitDelayMs { get; set; }
    public bool HasApiKey { get; set; }
}

/// <summary>
/// Schedule information.
/// </summary>
public class ScheduleInfo
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
/// Trigger response DTO.
/// </summary>
public class TriggerResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int RecordsProcessed { get; set; }
}
