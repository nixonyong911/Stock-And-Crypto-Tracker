using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
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
    private readonly ICryptoPriceTargetBackfillService _cryptoBackfillService;
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly ICryptoTickerRepository _cryptoTickerRepository;
    private readonly ILogger<PriceTargetController> _logger;

    public PriceTargetController(
        IPriceTargetBackfillService backfillService,
        ICryptoPriceTargetBackfillService cryptoBackfillService,
        IStockPriceRepository stockPriceRepository,
        ICryptoTickerRepository cryptoTickerRepository,
        ILogger<PriceTargetController> logger)
    {
        _backfillService = backfillService;
        _cryptoBackfillService = cryptoBackfillService;
        _stockPriceRepository = stockPriceRepository;
        _cryptoTickerRepository = cryptoTickerRepository;
        _logger = logger;
    }

    [HttpPost("backfill/{symbol}")]
    public async Task<IActionResult> BackfillSymbol(string symbol, [FromQuery] int? days = null)
    {
        try
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var ticker = tickers.FirstOrDefault(t => t.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));

            if (ticker == null)
                return NotFound(new { error = $"Stock symbol '{symbol}' not found" });

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

    [HttpPost("backfill/all")]
    public async Task<IActionResult> BackfillAll([FromQuery] int? days = null)
    {
        try
        {
            _logger.LogInformation("Price target backfill triggered for all stock tickers");

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

    [HttpPost("crypto/backfill/all")]
    public async Task<IActionResult> CryptoBackfillAll([FromQuery] int? days = null)
    {
        try
        {
            _logger.LogInformation("Crypto price target backfill triggered for all crypto tickers");

            var result = await _cryptoBackfillService.BackfillAllAsync(days ?? 90);

            return Ok(new
            {
                success = result.Failed == 0,
                asset_type = "crypto",
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
            _logger.LogError(ex, "Error during crypto price target backfill for all tickers");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpPost("crypto/backfill/{**symbol}")]
    public async Task<IActionResult> CryptoBackfillSymbol(string symbol, [FromQuery] int? days = null)
    {
        try
        {
            var ticker = await _cryptoTickerRepository.GetBySymbolAsync(symbol);

            if (ticker == null)
                return NotFound(new { error = $"Crypto symbol '{symbol}' not found" });

            _logger.LogInformation("Crypto price target backfill triggered for {Symbol}", symbol);

            var result = await _cryptoBackfillService.BackfillAsync(ticker.Id, ticker.Symbol, days ?? 90);

            return Ok(new
            {
                success = result.Failed == 0,
                symbol = ticker.Symbol,
                asset_type = "crypto",
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
            _logger.LogError(ex, "Error during crypto price target backfill for {Symbol}", symbol);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        try
        {
            return Ok(new
            {
                service = "Price Target Analysis Worker",
                version = "2.0.0",
                status = "Running",
                features = new[] { "stock", "crypto", "day_trader", "swing_trader", "long_term_trader" }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting price target status");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
