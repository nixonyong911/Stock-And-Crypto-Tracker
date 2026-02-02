using Finnhub.Worker.Configuration;
using Finnhub.Worker.Repositories;
using Finnhub.Worker.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Finnhub.Worker.Controllers;

/// <summary>
/// API controller for Finnhub fundamentals fetch operations.
/// </summary>
[ApiController]
[Route("api/fetch")]
[Produces("application/json")]
public class FetchController : ControllerBase
{
    private readonly IFundamentalsFetchService _fundamentalsService;
    private readonly IEarningsFetchService _earningsService;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly FinnhubSettings _settings;
    private readonly ILogger<FetchController> _logger;

    public FetchController(
        IFundamentalsFetchService fundamentalsService,
        IEarningsFetchService earningsService,
        IStockTickerRepository tickerRepo,
        IOptions<FinnhubSettings> settings,
        ILogger<FetchController> logger)
    {
        _fundamentalsService = fundamentalsService;
        _earningsService = earningsService;
        _tickerRepo = tickerRepo;
        _settings = settings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Gets the worker status and configuration.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(StatusResponse), 200)]
    public IActionResult GetStatus()
    {
        return Ok(new StatusResponse
        {
            Service = "Finnhub Fundamentals Worker",
            Status = "Running",
            Config = new ConfigInfo
            {
                BaseUrl = _settings.BaseUrl,
                RateLimitDelayMs = _settings.RateLimitDelayMs,
                HasApiKey = !string.IsNullOrEmpty(_settings.ApiKey)
            }
        });
    }

    /// <summary>
    /// Manually triggers a fundamentals fetch for a single ticker.
    /// </summary>
    /// <param name="tickerId">The stock ticker ID to fetch.</param>
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
    /// Manually triggers an earnings calendar sync.
    /// </summary>
    [HttpPost("trigger/earnings")]
    [ProducesResponseType(typeof(TriggerResponse), 200)]
    public async Task<IActionResult> TriggerEarningsSync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Manual trigger for earnings calendar sync");

        try
        {
            var count = await _earningsService.SyncEarningsCalendarAsync(cancellationToken: cancellationToken);
            return Ok(new TriggerResponse
            {
                Success = true,
                Message = $"Successfully synced {count} earnings events",
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
}

/// <summary>
/// Status response DTO.
/// </summary>
public class StatusResponse
{
    public string Service { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public ConfigInfo Config { get; set; } = new();
}

/// <summary>
/// Configuration info DTO.
/// </summary>
public class ConfigInfo
{
    public string BaseUrl { get; set; } = string.Empty;
    public int RateLimitDelayMs { get; set; }
    public bool HasApiKey { get; set; }
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
