using Microsoft.AspNetCore.Mvc;
using CandlestickAnalysis.Worker.Models;
using CandlestickAnalysis.Worker.Repositories;
using CandlestickAnalysis.Worker.Services;

namespace CandlestickAnalysis.Worker.Controllers;

/// <summary>
/// API controller for candlestick pattern analysis.
/// Routes are relative to PATH_BASE (/api/analysis).
/// </summary>
[ApiController]
[Route("")]
public class AnalysisController : ControllerBase
{
    private readonly ICandlestickAnalysisService _analysisService;
    private readonly IAnalysisRepository _analysisRepository;
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly ILogger<AnalysisController> _logger;

    public AnalysisController(
        ICandlestickAnalysisService analysisService,
        IAnalysisRepository analysisRepository,
        IStockPriceRepository stockPriceRepository,
        ILogger<AnalysisController> logger)
    {
        _analysisService = analysisService;
        _analysisRepository = analysisRepository;
        _stockPriceRepository = stockPriceRepository;
        _logger = logger;
    }

    /// <summary>
    /// Get worker status and configuration.
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var schedule = await _stockPriceRepository.GetScheduleByDataSourceNameAsync("CandlestickAnalysis");

        return Ok(new
        {
            service = "Candlestick Analysis Worker",
            version = "1.0.0",
            status = schedule?.IsEnabled == true ? "Running" : "Disabled",
            schedule = schedule != null ? new
            {
                name = schedule.Name,
                scheduleTime = schedule.ScheduleTime.ToString(),
                scheduleTimezone = schedule.ScheduleTimezone,
                isEnabled = schedule.IsEnabled,
                lastRunAt = schedule.LastRunAt,
                lastRunStatus = schedule.LastRunStatus,
                lastRunMessage = schedule.LastRunMessage
            } : null,
            patterns = new[]
            {
                "doji",
                "long_legged_doji",
                "hammer",
                "inverted_hammer",
                "shooting_star",
                "marubozu_bullish",
                "marubozu_bearish",
                "spinning_top"
            }
        });
    }

    /// <summary>
    /// Manually trigger analysis for a single symbol.
    /// </summary>
    [HttpPost("trigger/{symbol}")]
    public async Task<IActionResult> TriggerAnalysis(string symbol, [FromQuery] string? date = null)
    {
        try
        {
            // Parse date or use yesterday
            var analyzeDate = !string.IsNullOrEmpty(date)
                ? DateOnly.Parse(date)
                : DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));

            // Find the ticker
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var ticker = tickers.FirstOrDefault(t => t.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));

            if (ticker == null)
            {
                return NotFound(new { error = $"Symbol '{symbol}' not found" });
            }

            _logger.LogInformation("Manual analysis triggered for {Symbol} on {Date}", symbol, analyzeDate);

            var result = await _analysisService.AnalyzeStockAsync(ticker.Id, ticker.Symbol, analyzeDate);

            if (result == null)
            {
                return Ok(new
                {
                    success = true,
                    message = $"No price data found for {symbol} on {analyzeDate}",
                    symbol,
                    date = analyzeDate.ToString("yyyy-MM-dd")
                });
            }

            return Ok(new
            {
                success = true,
                message = $"Analyzed {symbol} for {analyzeDate}, detected {result.DetectedPatterns.Count} patterns",
                symbol = result.Symbol,
                date = result.AnalysisDate.ToString("yyyy-MM-dd"),
                candlesAggregated = result.CandlesAggregated,
                dailyCandle = new
                {
                    open = result.DailyOpen,
                    high = result.DailyHigh,
                    low = result.DailyLow,
                    close = result.DailyClose,
                    volume = result.DailyVolume,
                    isBullish = result.IsBullish
                },
                patterns = result.DetectedPatterns
            });
        }
        catch (FormatException)
        {
            return BadRequest(new { error = "Invalid date format. Use yyyy-MM-dd" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual analysis for {Symbol}", symbol);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Manually trigger analysis for all active stocks.
    /// </summary>
    [HttpPost("trigger/all")]
    public async Task<IActionResult> TriggerBatchAnalysis([FromQuery] string? date = null)
    {
        try
        {
            // Parse date or use yesterday
            var analyzeDate = !string.IsNullOrEmpty(date)
                ? DateOnly.Parse(date)
                : DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));

            _logger.LogInformation("Manual batch analysis triggered for {Date}", analyzeDate);

            var result = await _analysisService.AnalyzeAllStocksAsync(analyzeDate);

            return Ok(new
            {
                success = result.Success,
                date = result.AnalysisDate.ToString("yyyy-MM-dd"),
                totalStocks = result.TotalStocks,
                successCount = result.SuccessCount,
                failedCount = result.FailedCount,
                patternsDetected = result.PatternsDetected,
                durationSeconds = result.DurationSeconds,
                errors = result.Errors.Take(10)
            });
        }
        catch (FormatException)
        {
            return BadRequest(new { error = "Invalid date format. Use yyyy-MM-dd" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during batch analysis");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get analysis results for a symbol.
    /// </summary>
    [HttpGet("patterns/{symbol}")]
    public async Task<IActionResult> GetPatterns(
        string symbol,
        [FromQuery] string? startDate = null,
        [FromQuery] string? endDate = null)
    {
        try
        {
            DateOnly? start = !string.IsNullOrEmpty(startDate) ? DateOnly.Parse(startDate) : null;
            DateOnly? end = !string.IsNullOrEmpty(endDate) ? DateOnly.Parse(endDate) : null;

            var results = await _analysisRepository.GetAnalysisAsync(symbol, start, end);
            var resultList = results.ToList();

            return Ok(new
            {
                symbol,
                count = resultList.Count,
                results = resultList.Select(r => new
                {
                    date = r.AnalysisDate.ToString("yyyy-MM-dd"),
                    dailyCandle = new
                    {
                        open = r.DailyOpen,
                        high = r.DailyHigh,
                        low = r.DailyLow,
                        close = r.DailyClose,
                        volume = r.DailyVolume,
                        isBullish = r.IsBullish
                    },
                    patterns = r.DetectedPatterns,
                    candlesAggregated = r.CandlesAggregated
                })
            });
        }
        catch (FormatException)
        {
            return BadRequest(new { error = "Invalid date format. Use yyyy-MM-dd" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting patterns for {Symbol}", symbol);
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

