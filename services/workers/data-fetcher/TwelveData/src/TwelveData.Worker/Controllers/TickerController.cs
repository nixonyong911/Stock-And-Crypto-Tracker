using Microsoft.AspNetCore.Mvc;
using TwelveData.Worker.Models;
using TwelveData.Worker.Services;
using TwelveData.Worker.Services.RateLimiting;

namespace TwelveData.Worker.Controllers;

/// <summary>
/// API for managing stock, ETF, and crypto tickers
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class TickerController : ControllerBase
{
    private readonly ITickerManagementService _tickerService;
    private readonly ITwelveDataRateLimiter _rateLimiter;
    private readonly ILogger<TickerController> _logger;

    public TickerController(
        ITickerManagementService tickerService,
        ITwelveDataRateLimiter rateLimiter,
        ILogger<TickerController> logger)
    {
        _tickerService = tickerService;
        _rateLimiter = rateLimiter;
        _logger = logger;
    }

    /// <summary>
    /// Add a new ticker (stock, ETF, or crypto)
    /// </summary>
    /// <remarks>
    /// Verifies the symbol exists in Twelve Data before adding to the database.
    /// If the ticker already exists but is disabled, it will be re-enabled.
    /// If the daily rate limit is reached, the request will be queued for later processing.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType(typeof(AddTickerResult), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(AddTickerResult), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(AddTickerResult), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(AddTickerResult), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> AddTicker([FromBody] AddTickerRequest request, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Add ticker request: {Symbol} ({AssetType})", request.Symbol, request.AssetType);

        var result = await _tickerService.AddTickerAsync(request, cancellationToken);

        if (result.ErrorCode == "QUEUED")
        {
            return Accepted(result);
        }

        if (result.ErrorCode == "VALIDATION_ERROR")
        {
            return BadRequest(result);
        }

        if (result.ErrorCode == "NOT_FOUND")
        {
            return NotFound(result);
        }

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Toggle a ticker's active status (enable/disable)
    /// </summary>
    [HttpPatch("{id:int}/toggle")]
    [ProducesResponseType(typeof(ToggleTickerResult), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ToggleTickerResult), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleTicker(int id, [FromQuery] AssetType assetType = AssetType.Stock, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Toggle ticker request: ID {Id} ({AssetType})", id, assetType);

        var result = await _tickerService.ToggleTickerAsync(id, assetType, cancellationToken);

        if (result.ErrorCode == "NOT_FOUND")
        {
            return NotFound(result);
        }

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Get all tickers of a specific asset type
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<TickerResultData>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTickers(
        [FromQuery] AssetType assetType = AssetType.Stock,
        [FromQuery] bool? isActive = null,
        CancellationToken cancellationToken = default)
    {
        var tickers = await _tickerService.GetTickersAsync(assetType, isActive, cancellationToken);
        return Ok(new { tickers = tickers, count = tickers.Count() });
    }

    /// <summary>
    /// Get current Twelve Data API rate limit status
    /// </summary>
    [HttpGet("rate-limit")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRateLimitStatus()
    {
        var (minuteUsage, dailyUsage) = await _rateLimiter.GetCurrentUsageAsync();

        return Ok(new
        {
            minute = new
            {
                used = minuteUsage,
                limit = 8,
                remaining = Math.Max(0, 8 - minuteUsage)
            },
            daily = new
            {
                used = dailyUsage,
                limitInternal = 800,
                limitExternal = 700,
                remainingInternal = Math.Max(0, 800 - dailyUsage),
                remainingExternal = Math.Max(0, 700 - dailyUsage)
            },
            timestamp = DateTime.UtcNow
        });
    }
}
