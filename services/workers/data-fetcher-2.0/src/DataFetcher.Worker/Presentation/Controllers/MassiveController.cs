using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Massive.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for Massive indicator fetch and query operations.
/// Provides endpoints for manual triggering and querying of technical indicator data.
/// </summary>
[ApiController]
[Route("api/massive")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "massive")]
public class MassiveController : ControllerBase
{
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IStockIndicatorRepository _indicatorRepo;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<MassiveController> _logger;

    public MassiveController(
        IStockTickerRepository tickerRepo,
        IStockIndicatorRepository indicatorRepo,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<MassiveController> logger)
    {
        _tickerRepo = tickerRepo;
        _indicatorRepo = indicatorRepo;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Publishes daily indicator fetch requests for all active tickers to the RabbitMQ queue.
    /// Returns immediately after publishing; processing happens asynchronously.
    /// </summary>
    /// <param name="date">Target date in YYYY-MM-DD format. Defaults to yesterday.</param>
    [HttpPost("indicators/fetch-all")]
    [ProducesResponseType(typeof(MassiveFetchAllResponse), 200)]
    [ProducesResponseType(500)]
    public async Task<IActionResult> FetchAllIndicators([FromQuery] string? date = null)
    {
        try
        {
            var targetDate = string.IsNullOrEmpty(date)
                ? DateTime.UtcNow.Date.AddDays(-1).ToString("yyyy-MM-dd")
                : date;

            var tickers = await _tickerRepo.GetActiveTickersAsync();
            var tickerList = tickers.ToList();

            _logger.LogInformation(
                "Publishing Massive indicator fetch requests for {Count} tickers, date={Date}",
                tickerList.Count, targetDate);

            var symbols = new List<string>();
            var requests = new List<MassiveIndicatorRequest>();
            foreach (var ticker in tickerList)
            {
                var request = new MassiveIndicatorRequest
                {
                    Type = "daily",
                    Symbol = ticker.Symbol,
                    TickerId = ticker.Id,
                    TargetDate = targetDate,
                    RequestedAt = DateTime.UtcNow
                };

                requests.Add(request);
                symbols.Add(ticker.Symbol);
            }

            PublishBatchToQueue(requests);

            _logger.LogInformation("Published {Count} Massive indicator fetch requests", tickerList.Count);

            return Ok(new MassiveFetchAllResponse
            {
                Message = $"Published {tickerList.Count} fetch requests",
                Date = targetDate,
                Tickers = symbols
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error publishing Massive indicator fetch-all requests");
            return StatusCode(500, new { message = $"Error publishing fetch requests: {ex.Message}" });
        }
    }

    /// <summary>
    /// Publishes a daily indicator fetch request for a single ticker to the RabbitMQ queue.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol (e.g. "AAPL").</param>
    /// <param name="date">Target date in YYYY-MM-DD format. Defaults to yesterday.</param>
    [HttpPost("indicators/fetch/{symbol}")]
    [ProducesResponseType(typeof(MassiveFetchResponse), 200)]
    [ProducesResponseType(404)]
    [ProducesResponseType(500)]
    public async Task<IActionResult> FetchIndicator(string symbol, [FromQuery] string? date = null)
    {
        try
        {
            var targetDate = string.IsNullOrEmpty(date)
                ? DateTime.UtcNow.Date.AddDays(-1).ToString("yyyy-MM-dd")
                : date;

            var ticker = await _tickerRepo.GetBySymbolAsync(symbol.ToUpperInvariant());
            if (ticker == null)
            {
                return NotFound(new { message = $"Ticker '{symbol}' not found" });
            }

            var request = new MassiveIndicatorRequest
            {
                Type = "daily",
                Symbol = ticker.Symbol,
                TickerId = ticker.Id,
                TargetDate = targetDate,
                RequestedAt = DateTime.UtcNow
            };

            PublishToQueue(request);

            _logger.LogInformation(
                "Published Massive indicator fetch request for {Symbol}, date={Date}",
                ticker.Symbol, targetDate);

            return Ok(new MassiveFetchResponse
            {
                Message = "Published fetch request",
                Symbol = ticker.Symbol,
                Date = targetDate
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error publishing Massive indicator fetch request for {Symbol}", symbol);
            return StatusCode(500, new { message = $"Error publishing fetch request: {ex.Message}" });
        }
    }

    /// <summary>
    /// Publishes a backfill indicator request for a ticker covering a historical date range.
    /// This is the endpoint TwelveData calls after OHLC backfill succeeds.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol (e.g. "AAPL").</param>
    /// <param name="days">Number of days to backfill. Defaults to 90.</param>
    [HttpPost("indicators/backfill/{symbol}")]
    [ProducesResponseType(typeof(MassiveBackfillResponse), 200)]
    [ProducesResponseType(404)]
    [ProducesResponseType(500)]
    public async Task<IActionResult> BackfillIndicator(string symbol, [FromQuery] int days = 90)
    {
        try
        {
            var ticker = await _tickerRepo.GetBySymbolAsync(symbol.ToUpperInvariant());
            if (ticker == null)
            {
                return NotFound(new { message = $"Ticker '{symbol}' not found" });
            }

            var endDate = DateTime.UtcNow.Date.AddDays(-1);
            var startDate = DateTime.UtcNow.Date.AddDays(-days);
            var startDateStr = startDate.ToString("yyyy-MM-dd");
            var endDateStr = endDate.ToString("yyyy-MM-dd");

            // Publish 4 messages per ticker (one per indicator type) for granular processing
            var indicatorTypes = new[] { "sma", "ema", "macd", "rsi" };
            var requests = indicatorTypes.Select(indicatorType => new MassiveIndicatorRequest
            {
                Type = "backfill",
                Symbol = ticker.Symbol,
                TickerId = ticker.Id,
                IndicatorType = indicatorType,
                StartDate = startDateStr,
                EndDate = endDateStr,
                RequestedAt = DateTime.UtcNow
            }).ToList();

            PublishBatchToQueue(requests);

            _logger.LogInformation(
                "Published {Count} Massive indicator backfill requests for {Symbol}, {StartDate} to {EndDate} ({Days} days)",
                requests.Count, ticker.Symbol, startDateStr, endDateStr, days);

            return Ok(new MassiveBackfillResponse
            {
                Message = $"Published {requests.Count} backfill requests (sma, ema, macd, rsi)",
                Symbol = ticker.Symbol,
                StartDate = startDateStr,
                EndDate = endDateStr,
                Days = days
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error publishing Massive indicator backfill request for {Symbol}", symbol);
            return StatusCode(500, new { message = $"Error publishing backfill request: {ex.Message}" });
        }
    }

    /// <summary>
    /// Purges all pending messages from the massive-indicator-queue.
    /// Use this to stop/clear the queue when you need to cancel queued work.
    /// </summary>
    [HttpPost("queue/purge")]
    [ProducesResponseType(typeof(MassiveQueuePurgeResponse), 200)]
    [ProducesResponseType(500)]
    public IActionResult PurgeQueue()
    {
        try
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

            var purgedCount = channel.QueuePurge(_rabbitSettings.MassiveQueueName);

            _logger.LogWarning(
                "Purged {Count} messages from queue {Queue}",
                purgedCount, _rabbitSettings.MassiveQueueName);

            return Ok(new MassiveQueuePurgeResponse
            {
                Message = $"Purged {purgedCount} messages from {_rabbitSettings.MassiveQueueName}",
                PurgedCount = purgedCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error purging massive indicator queue");
            return StatusCode(500, new { message = $"Error purging queue: {ex.Message}" });
        }
    }

    /// <summary>
    /// Retrieves stored indicator data for a ticker on a specific date.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol (e.g. "AAPL").</param>
    /// <param name="date">Target date in YYYY-MM-DD format. Defaults to today.</param>
    [HttpGet("indicators/{symbol}")]
    [ProducesResponseType(typeof(IEnumerable<object>), 200)]
    [ProducesResponseType(404)]
    [ProducesResponseType(500)]
    public async Task<IActionResult> GetIndicators(string symbol, [FromQuery] string? date = null)
    {
        try
        {
            var targetDate = string.IsNullOrEmpty(date)
                ? DateTime.UtcNow.Date
                : DateTime.Parse(date);

            var ticker = await _tickerRepo.GetBySymbolAsync(symbol.ToUpperInvariant());
            if (ticker == null)
            {
                return NotFound(new { message = $"Ticker '{symbol}' not found" });
            }

            var indicators = await _indicatorRepo.GetByTickerAndDateAsync(ticker.Id, targetDate);

            return Ok(indicators);
        }
        catch (FormatException)
        {
            return BadRequest(new { message = $"Invalid date format: '{date}'. Expected YYYY-MM-DD." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving Massive indicators for {Symbol}", symbol);
            return StatusCode(500, new { message = $"Error retrieving indicators: {ex.Message}" });
        }
    }

    /// <summary>
    /// Publishes a single MassiveIndicatorRequest message to the RabbitMQ queue.
    /// </summary>
    private void PublishToQueue(MassiveIndicatorRequest request)
    {
        PublishBatchToQueue(new[] { request });
    }

    /// <summary>
    /// Publishes a batch of MassiveIndicatorRequest messages to the RabbitMQ queue
    /// using a single connection to avoid resource exhaustion.
    /// </summary>
    private void PublishBatchToQueue(IEnumerable<MassiveIndicatorRequest> requests)
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
            queue: _rabbitSettings.MassiveQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false);

        foreach (var request in requests)
        {
            var message = JsonSerializer.Serialize(request);
            var body = Encoding.UTF8.GetBytes(message);
            var properties = channel.CreateBasicProperties();
            properties.Persistent = true;
            properties.ContentType = "application/json";

            channel.BasicPublish(
                exchange: string.Empty,
                routingKey: _rabbitSettings.MassiveQueueName,
                basicProperties: properties,
                body: body);
        }
    }
}

/// <summary>
/// Response for fetch-all endpoint.
/// </summary>
public class MassiveFetchAllResponse
{
    public string Message { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public List<string> Tickers { get; set; } = new();
}

/// <summary>
/// Response for single fetch endpoint.
/// </summary>
public class MassiveFetchResponse
{
    public string Message { get; set; } = string.Empty;
    public string Symbol { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
}

/// <summary>
/// Response for backfill endpoint.
/// </summary>
public class MassiveBackfillResponse
{
    public string Message { get; set; } = string.Empty;
    public string Symbol { get; set; } = string.Empty;
    public string StartDate { get; set; } = string.Empty;
    public string EndDate { get; set; } = string.Empty;
    public int Days { get; set; }
}

/// <summary>
/// Response for queue purge endpoint.
/// </summary>
public class MassiveQueuePurgeResponse
{
    public string Message { get; set; } = string.Empty;
    public uint PurgedCount { get; set; }
}
