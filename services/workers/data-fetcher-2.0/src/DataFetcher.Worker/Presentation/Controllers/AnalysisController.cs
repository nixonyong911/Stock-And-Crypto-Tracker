using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for candlestick pattern analysis.
/// Provides endpoints for triggering analysis, querying patterns, and backfill operations.
/// </summary>
[ApiController]
[Route("api/analysis")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "analysis")]
public class AnalysisController : ControllerBase
{
    private readonly ICandlestickAnalysisService _analysisService;
    private readonly IAnalysisRepository _analysisRepository;
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly IFetchScheduleRepository _fetchScheduleRepository;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<AnalysisController> _logger;

    public AnalysisController(
        ICandlestickAnalysisService analysisService,
        IAnalysisRepository analysisRepository,
        IStockPriceRepository stockPriceRepository,
        IFetchScheduleRepository fetchScheduleRepository,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<AnalysisController> logger)
    {
        _analysisService = analysisService;
        _analysisRepository = analysisRepository;
        _stockPriceRepository = stockPriceRepository;
        _fetchScheduleRepository = fetchScheduleRepository;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Get worker status and configuration.
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        try
        {
            var schedule = await _fetchScheduleRepository.GetScheduleByDataSourceNameAsync("CandlestickAnalysis");

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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting analysis status");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Manually trigger analysis for a single symbol.
    /// </summary>
    [HttpPost("trigger/{symbol}")]
    public async Task<IActionResult> TriggerAnalysis(string symbol, [FromQuery] string? date = null)
    {
        try
        {
            var analyzeDate = !string.IsNullOrEmpty(date)
                ? DateOnly.Parse(date)
                : DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));

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

    /// <summary>
    /// Queue a historical analysis backfill request for a single symbol.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., AAPL, MSFT)</param>
    /// <param name="days">Optional: Number of days to backfill (default: 180)</param>
    [HttpPost("backfill/{symbol}")]
    [ProducesResponseType(typeof(AnalysisBackfillResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(AnalysisBackfillResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(AnalysisBackfillResponse), StatusCodes.Status500InternalServerError)]
    public ActionResult<AnalysisBackfillResponse> QueueBackfill(
        string symbol,
        [FromQuery] int? days = null)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new AnalysisBackfillResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        symbol = symbol.ToUpperInvariant();

        _logger.LogInformation("Backfill request received for {Symbol} - queuing to RabbitMQ", symbol);

        try
        {
            var request = new AnalysisBackfillRequest
            {
                Symbol = symbol,
                RequestedAt = DateTime.UtcNow,
                DaysToBackfill = days
            };

            PublishToQueue(request);

            return Accepted(new AnalysisBackfillResponse
            {
                Success = true,
                Message = $"Analysis backfill request queued for {symbol}. Processing will begin shortly.",
                Symbol = symbol,
                QueuedAt = request.RequestedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue backfill request for {Symbol}", symbol);

            return StatusCode(500, new AnalysisBackfillResponse
            {
                Success = false,
                Message = $"Failed to queue backfill request: {ex.Message}",
                Symbol = symbol
            });
        }
    }

    /// <summary>
    /// Queue historical analysis backfill for ALL active tickers.
    /// </summary>
    /// <param name="days">Optional: Number of days to backfill (default: 180)</param>
    [HttpPost("backfill/all")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> QueueBackfillAll([FromQuery] int? days = null)
    {
        _logger.LogInformation("Backfill ALL request received - queuing all active tickers");

        try
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();

            var queuedCount = 0;
            var errors = new List<string>();

            foreach (var ticker in tickerList)
            {
                try
                {
                    var request = new AnalysisBackfillRequest
                    {
                        Symbol = ticker.Symbol,
                        TickerId = ticker.Id,
                        RequestedAt = DateTime.UtcNow,
                        DaysToBackfill = days
                    };

                    PublishToQueue(request);
                    queuedCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to queue backfill for {Symbol}", ticker.Symbol);
                    errors.Add($"{ticker.Symbol}: {ex.Message}");
                }
            }

            _logger.LogInformation(
                "Queued {Queued}/{Total} tickers for analysis backfill",
                queuedCount, tickerList.Count);

            return Accepted(new
            {
                success = errors.Count == 0,
                message = $"Queued {queuedCount}/{tickerList.Count} tickers for analysis backfill",
                totalTickers = tickerList.Count,
                queuedCount,
                failedCount = errors.Count,
                daysToBackfill = days ?? 180,
                errors = errors.Take(10)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue backfill for all tickers");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Webhook endpoint for receiving backfill requests from TwelveData worker.
    /// </summary>
    [HttpPost("webhook/backfill")]
    [ProducesResponseType(typeof(AnalysisBackfillResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(AnalysisBackfillResponse), StatusCodes.Status400BadRequest)]
    public ActionResult<AnalysisBackfillResponse> HandleBackfillWebhook([FromBody] AnalysisBackfillRequest? request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Symbol))
        {
            _logger.LogWarning("Received webhook with null or invalid payload");
            return BadRequest(new AnalysisBackfillResponse
            {
                Success = false,
                Message = "Invalid webhook payload - symbol is required"
            });
        }

        _logger.LogInformation(
            "Webhook received for analysis backfill: {Symbol} (TickerId: {TickerId})",
            request.Symbol, request.TickerId);

        try
        {
            if (request.RequestedAt == default)
            {
                request.RequestedAt = DateTime.UtcNow;
            }

            PublishToQueue(request);

            return Accepted(new AnalysisBackfillResponse
            {
                Success = true,
                Message = $"Analysis backfill queued for {request.Symbol}",
                Symbol = request.Symbol,
                QueuedAt = request.RequestedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue backfill from webhook for {Symbol}", request.Symbol);

            return StatusCode(500, new AnalysisBackfillResponse
            {
                Success = false,
                Message = $"Failed to queue backfill: {ex.Message}",
                Symbol = request.Symbol
            });
        }
    }

    private void PublishToQueue(AnalysisBackfillRequest request)
    {
        var factory = new ConnectionFactory
        {
            HostName = _rabbitSettings.HostName,
            UserName = _rabbitSettings.UserName,
            Password = _rabbitSettings.Password,
            Port = _rabbitSettings.Port
        };

        using var connection = factory.CreateConnection();
        using var channel = connection.CreateModel();

        channel.QueueDeclare(
            queue: _rabbitSettings.AnalysisBackfillQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        var message = JsonSerializer.Serialize(request);
        var body = Encoding.UTF8.GetBytes(message);

        var properties = channel.CreateBasicProperties();
        properties.Persistent = true;
        properties.ContentType = "application/json";

        channel.BasicPublish(
            exchange: string.Empty,
            routingKey: _rabbitSettings.AnalysisBackfillQueueName,
            basicProperties: properties,
            body: body);

        _logger.LogInformation(
            "Published analysis backfill request to queue: {Symbol} (queue: {Queue})",
            request.Symbol, _rabbitSettings.AnalysisBackfillQueueName);
    }
}
