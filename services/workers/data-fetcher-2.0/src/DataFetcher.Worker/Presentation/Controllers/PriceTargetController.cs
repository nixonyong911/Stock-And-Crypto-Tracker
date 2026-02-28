using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

[ApiController]
[Route("api/price-targets")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "price-targets")]
public class PriceTargetController : ControllerBase
{
    private readonly IPriceTargetBackfillService _backfillService;
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly ILogger<PriceTargetController> _logger;

    public PriceTargetController(
        IPriceTargetBackfillService backfillService,
        IStockPriceRepository stockPriceRepository,
        ILogger<PriceTargetController> logger)
    {
        _backfillService = backfillService;
        _stockPriceRepository = stockPriceRepository;
        _logger = logger;
    }

    /// <summary>
    /// Backfill price targets for a single symbol.
    /// </summary>
    [HttpPost("backfill/{symbol}")]
    public async Task<IActionResult> BackfillSymbol(string symbol, [FromQuery] int? days = null)
    {
        try
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var ticker = tickers.FirstOrDefault(t => t.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));

            if (ticker == null)
            {
                return NotFound(new { error = $"Symbol '{symbol}' not found" });
            }

            _logger.LogInformation("Price target backfill triggered for {Symbol}", symbol);

            var result = await _backfillService.BackfillAsync(ticker.Id, ticker.Symbol, days ?? 90);

            return Ok(new
            {
                success = result.Failed == 0,
                symbol = ticker.Symbol,
                computed = result.Computed,
                skipped = result.Skipped,
                failed = result.Failed,
                totalDates = result.TotalDates,
                durationSeconds = result.Duration.TotalSeconds,
                errors = result.Errors.Take(10)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during price target backfill for {Symbol}", symbol);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Backfill price targets for all active tickers.
    /// </summary>
    [HttpPost("backfill/all")]
    public async Task<IActionResult> BackfillAll([FromQuery] int? days = null)
    {
        try
        {
            _logger.LogInformation("Price target backfill triggered for all tickers");

            var result = await _backfillService.BackfillAllAsync(days ?? 90);

            return Ok(new
            {
                success = result.Failed == 0,
                computed = result.Computed,
                skipped = result.Skipped,
                failed = result.Failed,
                totalDates = result.TotalDates,
                durationSeconds = result.Duration.TotalSeconds,
                errors = result.Errors.Take(10)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during price target backfill for all tickers");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get price target worker status.
    /// </summary>
    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        try
        {
            return Ok(new
            {
                service = "Price Target Analysis Worker",
                version = "1.0.0",
                status = "Running"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting price target status");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
