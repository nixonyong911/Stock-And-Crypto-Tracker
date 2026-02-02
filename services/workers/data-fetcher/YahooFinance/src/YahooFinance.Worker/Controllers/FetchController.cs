using Microsoft.AspNetCore.Mvc;
using YahooFinance.Worker.Repositories;
using YahooFinance.Worker.Services;

namespace YahooFinance.Worker.Controllers;

/// <summary>
/// API endpoints for managing Yahoo Finance fundamentals fetching.
/// </summary>
[ApiController]
[Route("api/fetch")]
[Tags("Fetch Operations")]
public class FetchController : ControllerBase
{
    private const string DataSourceName = "YahooFinance";

    private readonly IFundamentalsFetchService _fetchService;
    private readonly IFetchScheduleRepository _scheduleRepository;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly ILogger<FetchController> _logger;

    public FetchController(
        IFundamentalsFetchService fetchService,
        IFetchScheduleRepository scheduleRepository,
        IStockTickerRepository tickerRepository,
        ILogger<FetchController> logger)
    {
        _fetchService = fetchService;
        _scheduleRepository = scheduleRepository;
        _tickerRepository = tickerRepository;
        _logger = logger;
    }

    /// <summary>
    /// Get worker status and configuration.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(WorkerStatusResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<WorkerStatusResponse>> GetStatus()
    {
        var schedule = await _scheduleRepository.GetScheduleByDataSourceNameAsync(DataSourceName);
        var tickers = await _tickerRepository.GetActiveTickersAsync();

        return Ok(new WorkerStatusResponse
        {
            WorkerName = "yahoofinance",
            DataSource = DataSourceName,
            Version = "1.0.0",
            ActiveTickers = tickers.Count(),
            Schedule = schedule != null ? new ScheduleInfo
            {
                Name = schedule.Name,
                ScheduleTime = schedule.ScheduleTime.ToString(@"hh\:mm\:ss"),
                Timezone = schedule.ScheduleTimezone,
                IsEnabled = schedule.IsEnabled,
                LastRunAt = schedule.LastRunAt,
                LastRunStatus = schedule.LastRunStatus,
                LastRunMessage = schedule.LastRunMessage
            } : null
        });
    }

    /// <summary>
    /// Manually trigger fundamentals fetch for a single ticker.
    /// </summary>
    /// <param name="symbol">Stock ticker symbol (e.g., AAPL)</param>
    [HttpPost("trigger/{symbol}")]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TriggerResponse>> TriggerSingle(string symbol)
    {
        _logger.LogInformation("Manual trigger requested for {Symbol}", symbol);

        var ticker = await _tickerRepository.GetBySymbolAsync(symbol.ToUpperInvariant());
        if (ticker == null)
        {
            return NotFound(new { error = $"Ticker {symbol} not found or not active" });
        }

        var success = await _fetchService.FetchFundamentalsForTickerAsync(ticker);

        return Ok(new TriggerResponse
        {
            Symbol = ticker.Symbol,
            Success = success,
            Message = success ? "Fundamentals fetched successfully" : "Failed to fetch fundamentals"
        });
    }

    /// <summary>
    /// Manually trigger fundamentals fetch for all active tickers.
    /// </summary>
    [HttpPost("trigger/all")]
    [ProducesResponseType(typeof(TriggerAllResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<TriggerAllResponse>> TriggerAll()
    {
        _logger.LogInformation("Manual trigger requested for all tickers");

        var startTime = DateTime.UtcNow;
        var count = await _fetchService.FetchAllFundamentalsAsync();
        var duration = (DateTime.UtcNow - startTime).TotalSeconds;

        return Ok(new TriggerAllResponse
        {
            TickersProcessed = count,
            DurationSeconds = duration,
            Message = $"Processed {count} tickers in {duration:F2}s"
        });
    }
}

// Response DTOs
public class WorkerStatusResponse
{
    public string WorkerName { get; set; } = string.Empty;
    public string DataSource { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public int ActiveTickers { get; set; }
    public ScheduleInfo? Schedule { get; set; }
}

public class ScheduleInfo
{
    public string Name { get; set; } = string.Empty;
    public string ScheduleTime { get; set; } = string.Empty;
    public string Timezone { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
    public string? LastRunMessage { get; set; }
}

public class TriggerResponse
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class TriggerAllResponse
{
    public int TickersProcessed { get; set; }
    public double DurationSeconds { get; set; }
    public string Message { get; set; } = string.Empty;
}
