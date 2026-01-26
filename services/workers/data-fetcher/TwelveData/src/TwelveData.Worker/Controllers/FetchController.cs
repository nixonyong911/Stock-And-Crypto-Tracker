using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Controllers;

/// <summary>
/// Endpoints for fetching stock and crypto price data from TwelveData API.
/// Supports single symbol, batch fetch, historical backfill, and webhooks.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class FetchController : ControllerBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<FetchController> _logger;

    public FetchController(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<FetchController> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Trigger fetch for a specific symbol. Creates the ticker if it doesn't exist.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., AAPL, MSFT, GOOGL)</param>
    /// <param name="date">Optional date to fetch. Format: "YYYY-MM-DD" (e.g., "2025-12-24") or "yesterday". Defaults to "yesterday" if not provided.</param>
    [HttpPost("trigger/{symbol}")]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<FetchResponse>> TriggerFetchSymbol(
        string symbol,
        [FromQuery] string? date = null)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        symbol = symbol.ToUpperInvariant();
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;

        _logger.LogInformation("Manual fetch triggered for symbol {Symbol} with date {Date} via API", symbol, fetchDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var fetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();

            var recordsInserted = await fetchService.FetchSymbolAsync(symbol, date);

            return Ok(new FetchResponse
            {
                Success = true,
                Message = $"Fetched {recordsInserted} records for symbol {symbol} (date: {fetchDate}).",
                RecordsInserted = recordsInserted,
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Configuration error fetching symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = ex.Message,
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "API error fetching symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = $"TwelveData API error: {ex.Message}",
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching symbol {Symbol}", symbol);
            return StatusCode(500, new FetchResponse
            {
                Success = false,
                Message = $"Internal error: {ex.Message}",
                Symbol = symbol,
                Date = fetchDate
            });
        }
    }

    /// <summary>
    /// Trigger fetch for all active tickers. Useful for cron jobs and batch operations.
    /// </summary>
    /// <param name="date">Optional date to fetch. Format: "YYYY-MM-DD" or "yesterday". Defaults to "yesterday".</param>
    [HttpPost("trigger/all")]
    [ProducesResponseType(typeof(BatchFetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(BatchFetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<BatchFetchResponse>> TriggerFetchAll([FromQuery] string? date = null)
    {
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;

        _logger.LogInformation("Batch fetch triggered for all active tickers with date {Date} via API", fetchDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var fetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();

            var result = await fetchService.FetchAllActiveTickersAsync(date);

            return Ok(new BatchFetchResponse
            {
                Success = result.FailedCount == 0,
                Message = $"Batch fetch completed: {result.SuccessCount} succeeded, {result.FailedCount} failed, {result.TotalRecordsInserted} records inserted.",
                Date = fetchDate,
                SuccessCount = result.SuccessCount,
                FailedCount = result.FailedCount,
                TotalRecordsInserted = result.TotalRecordsInserted,
                Results = result.SymbolResults.Select(r => new SymbolFetchResult
                {
                    Symbol = r.Symbol,
                    Success = r.Success,
                    RecordsInserted = r.RecordsInserted,
                    Error = r.Error
                }).ToList()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during batch fetch");
            return StatusCode(500, new BatchFetchResponse
            {
                Success = false,
                Message = $"Batch fetch error: {ex.Message}",
                Date = fetchDate
            });
        }
    }

    /// <summary>
    /// Get service status and configuration info
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(StatusResponse), StatusCodes.Status200OK)]
    public ActionResult<StatusResponse> GetStatus()
    {
        return Ok(new StatusResponse
        {
            Service = "TwelveData Fetcher",
            Status = "Running",
            DefaultConfig = new ConfigInfo
            {
                FetchDate = "yesterday",
                Interval = "15min",
                OutputSize = 30,
                Exchange = "NASDAQ",
                Timezone = "America/New_York"
            }
        });
    }

    // ==================== CRYPTO ENDPOINTS ====================

    /// <summary>
    /// Trigger fetch for a specific crypto symbol. Creates the ticker if it doesn't exist.
    /// </summary>
    /// <param name="symbol">Crypto symbol (e.g., BTC/USD, ETH/USD)</param>
    /// <param name="date">Optional date to fetch. Format: "YYYY-MM-DD" or "yesterday". Defaults to "yesterday".</param>
    [HttpPost("crypto/trigger/{symbol}")]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<FetchResponse>> TriggerCryptoFetchSymbol(
        string symbol,
        [FromQuery] string? date = null)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        symbol = symbol.ToUpperInvariant();
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;

        _logger.LogInformation("Manual crypto fetch triggered for symbol {Symbol} with date {Date} via API", symbol, fetchDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var cryptoFetchService = scope.ServiceProvider.GetRequiredService<ICryptoFetchService>();

            var recordsInserted = await cryptoFetchService.FetchSymbolAsync(symbol, date);

            return Ok(new FetchResponse
            {
                Success = true,
                Message = $"Fetched {recordsInserted} records for crypto symbol {symbol} (date: {fetchDate}).",
                RecordsInserted = recordsInserted,
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Configuration error fetching crypto symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = ex.Message,
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "API error fetching crypto symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = $"TwelveData API error: {ex.Message}",
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching crypto symbol {Symbol}", symbol);
            return StatusCode(500, new FetchResponse
            {
                Success = false,
                Message = $"Internal error: {ex.Message}",
                Symbol = symbol,
                Date = fetchDate
            });
        }
    }

    /// <summary>
    /// Trigger fetch for all active crypto tickers. Useful for cron jobs and batch operations.
    /// </summary>
    /// <param name="date">Optional date to fetch. Format: "YYYY-MM-DD" or "yesterday". Defaults to "yesterday".</param>
    [HttpPost("crypto/trigger/all")]
    [ProducesResponseType(typeof(BatchFetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(BatchFetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<BatchFetchResponse>> TriggerCryptoFetchAll([FromQuery] string? date = null)
    {
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;

        _logger.LogInformation("Crypto batch fetch triggered for all active tickers with date {Date} via API", fetchDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var cryptoFetchService = scope.ServiceProvider.GetRequiredService<ICryptoFetchService>();

            var result = await cryptoFetchService.FetchAllActiveTickersAsync(date);

            return Ok(new BatchFetchResponse
            {
                Success = result.FailedCount == 0,
                Message = $"Crypto batch fetch completed: {result.SuccessCount} succeeded, {result.FailedCount} failed, {result.TotalRecordsInserted} records inserted.",
                Date = fetchDate,
                SuccessCount = result.SuccessCount,
                FailedCount = result.FailedCount,
                TotalRecordsInserted = result.TotalRecordsInserted,
                Results = result.SymbolResults.Select(r => new SymbolFetchResult
                {
                    Symbol = r.Symbol,
                    Success = r.Success,
                    RecordsInserted = r.RecordsInserted,
                    Error = r.Error
                }).ToList()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during crypto batch fetch");
            return StatusCode(500, new BatchFetchResponse
            {
                Success = false,
                Message = $"Crypto batch fetch error: {ex.Message}",
                Date = fetchDate
            });
        }
    }

    /// <summary>
    /// Queue a historical backfill request for a symbol.
    /// This endpoint is designed to be called by Supabase webhook when a new ticker is added.
    /// The request is queued in RabbitMQ for FIFO processing to prevent API rate limit issues.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., AAPL, MSFT, GOOGL)</param>
    /// <param name="exchange">Optional exchange (defaults to NASDAQ)</param>
    [HttpPost("backfill/{symbol}")]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status500InternalServerError)]
    public ActionResult<BackfillResponse> QueueBackfill(
        string symbol,
        [FromQuery] string? exchange = null)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new BackfillResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        symbol = symbol.ToUpperInvariant();
        var actualExchange = string.IsNullOrWhiteSpace(exchange) ? "NASDAQ" : exchange.ToUpperInvariant();

        _logger.LogInformation(
            "Backfill request received for {Symbol} on {Exchange} - queuing to RabbitMQ",
            symbol, actualExchange);

        try
        {
            var request = new BackfillRequest
            {
                Symbol = symbol,
                Exchange = actualExchange,
                RequestedAt = DateTime.UtcNow
            };

            // Publish to RabbitMQ queue
            PublishToQueue(request);

            return Accepted(new BackfillResponse
            {
                Success = true,
                Message = $"Backfill request queued for {symbol}. Processing will begin shortly.",
                Symbol = symbol,
                QueuedAt = request.RequestedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue backfill request for {Symbol}", symbol);

            return StatusCode(500, new BackfillResponse
            {
                Success = false,
                Message = $"Failed to queue backfill request: {ex.Message}",
                Symbol = symbol
            });
        }
    }

    /// <summary>
    /// Webhook endpoint for Supabase database trigger.
    /// Called when a new row is inserted into stock_tickers table.
    /// </summary>
    [HttpPost("webhook/new-ticker")]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status400BadRequest)]
    public ActionResult<BackfillResponse> HandleNewTickerWebhook([FromBody] SupabaseWebhookPayload? payload)
    {
        if (payload?.Record == null)
        {
            _logger.LogWarning("Received webhook with null or invalid payload");
            return BadRequest(new BackfillResponse
            {
                Success = false,
                Message = "Invalid webhook payload"
            });
        }

        var symbol = payload.Record.Symbol;
        var exchange = payload.Record.Exchange ?? "NASDAQ";

        if (string.IsNullOrWhiteSpace(symbol))
        {
            _logger.LogWarning("Received webhook with empty symbol");
            return BadRequest(new BackfillResponse
            {
                Success = false,
                Message = "Symbol is required in webhook payload"
            });
        }

        _logger.LogInformation(
            "Webhook received: New ticker {Symbol} on {Exchange} (type: {Type})",
            symbol, exchange, payload.Type);

        // Only process INSERT events
        if (payload.Type != "INSERT")
        {
            _logger.LogInformation("Ignoring non-INSERT webhook event: {Type}", payload.Type);
            return Ok(new BackfillResponse
            {
                Success = true,
                Message = $"Ignored {payload.Type} event - only INSERT triggers backfill"
            });
        }

        try
        {
            var request = new BackfillRequest
            {
                Symbol = symbol.ToUpperInvariant(),
                Exchange = exchange.ToUpperInvariant(),
                RequestedAt = DateTime.UtcNow,
                TickerId = payload.Record.Id
            };

            PublishToQueue(request);

            return Accepted(new BackfillResponse
            {
                Success = true,
                Message = $"Backfill queued for new ticker {symbol}",
                Symbol = symbol,
                QueuedAt = request.RequestedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue backfill from webhook for {Symbol}", symbol);

            return StatusCode(500, new BackfillResponse
            {
                Success = false,
                Message = $"Failed to queue backfill: {ex.Message}",
                Symbol = symbol
            });
        }
    }

    /// <summary>
    /// Webhook endpoint for Supabase database trigger on crypto_tickers table.
    /// Called when a new row is inserted into crypto_tickers table.
    /// </summary>
    [HttpPost("webhook/new-crypto-ticker")]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status400BadRequest)]
    public ActionResult<BackfillResponse> HandleNewCryptoTickerWebhook([FromBody] CryptoSupabaseWebhookPayload? payload)
    {
        if (payload?.Record == null)
        {
            _logger.LogWarning("Received crypto webhook with null or invalid payload");
            return BadRequest(new BackfillResponse
            {
                Success = false,
                Message = "Invalid webhook payload"
            });
        }

        var symbol = payload.Record.Symbol;

        if (string.IsNullOrWhiteSpace(symbol))
        {
            _logger.LogWarning("Received crypto webhook with empty symbol");
            return BadRequest(new BackfillResponse
            {
                Success = false,
                Message = "Symbol is required in webhook payload"
            });
        }

        _logger.LogInformation(
            "Crypto webhook received: New ticker {Symbol} (type: {Type})",
            symbol, payload.Type);

        // Only process INSERT events
        if (payload.Type != "INSERT")
        {
            _logger.LogInformation("Ignoring non-INSERT crypto webhook event: {Type}", payload.Type);
            return Ok(new BackfillResponse
            {
                Success = true,
                Message = $"Ignored {payload.Type} event - only INSERT triggers backfill"
            });
        }

        try
        {
            var request = new CryptoBackfillRequest
            {
                Symbol = symbol.ToUpperInvariant(),
                RequestedAt = DateTime.UtcNow,
                TickerId = payload.Record.Id
            };

            PublishToCryptoQueue(request);

            return Accepted(new BackfillResponse
            {
                Success = true,
                Message = $"Crypto backfill queued for new ticker {symbol}",
                Symbol = symbol,
                QueuedAt = request.RequestedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue crypto backfill from webhook for {Symbol}", symbol);

            return StatusCode(500, new BackfillResponse
            {
                Success = false,
                Message = $"Failed to queue crypto backfill: {ex.Message}",
                Symbol = symbol
            });
        }
    }

    /// <summary>
    /// Queue a crypto historical backfill request for a symbol.
    /// </summary>
    /// <param name="symbol">Crypto symbol (e.g., BTC/USD, ETH/USD)</param>
    [HttpPost("crypto/backfill/{symbol}")]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(BackfillResponse), StatusCodes.Status500InternalServerError)]
    public ActionResult<BackfillResponse> QueueCryptoBackfill(string symbol)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new BackfillResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        // Normalize symbol: btc -> BTC/USD
        symbol = symbol.ToUpperInvariant().Trim();
        if (!symbol.Contains('/'))
        {
            symbol = $"{symbol}/USD";
        }

        _logger.LogInformation(
            "Crypto backfill request received for {Symbol} - queuing to RabbitMQ",
            symbol);

        try
        {
            var request = new CryptoBackfillRequest
            {
                Symbol = symbol,
                RequestedAt = DateTime.UtcNow
            };

            PublishToCryptoQueue(request);

            return Accepted(new BackfillResponse
            {
                Success = true,
                Message = $"Crypto backfill request queued for {symbol}. Processing will begin shortly.",
                Symbol = symbol,
                QueuedAt = request.RequestedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to queue crypto backfill request for {Symbol}", symbol);

            return StatusCode(500, new BackfillResponse
            {
                Success = false,
                Message = $"Failed to queue crypto backfill request: {ex.Message}",
                Symbol = symbol
            });
        }
    }

    private void PublishToQueue(BackfillRequest request)
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

        // Ensure queue exists
        channel.QueueDeclare(
            queue: _rabbitSettings.QueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        var message = JsonSerializer.Serialize(request);
        var body = Encoding.UTF8.GetBytes(message);

        // Publish with persistent delivery mode
        var properties = channel.CreateBasicProperties();
        properties.Persistent = true;
        properties.ContentType = "application/json";

        channel.BasicPublish(
            exchange: string.Empty,
            routingKey: _rabbitSettings.QueueName,
            basicProperties: properties,
            body: body);

        _logger.LogInformation(
            "Published backfill request to queue: {Symbol} (queue: {Queue})",
            request.Symbol, _rabbitSettings.QueueName);
    }

    private void PublishToCryptoQueue(CryptoBackfillRequest request)
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

        // Ensure crypto queue exists
        channel.QueueDeclare(
            queue: _rabbitSettings.CryptoQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        var message = JsonSerializer.Serialize(request);
        var body = Encoding.UTF8.GetBytes(message);

        // Publish with persistent delivery mode
        var properties = channel.CreateBasicProperties();
        properties.Persistent = true;
        properties.ContentType = "application/json";

        channel.BasicPublish(
            exchange: string.Empty,
            routingKey: _rabbitSettings.CryptoQueueName,
            basicProperties: properties,
            body: body);

        _logger.LogInformation(
            "Published crypto backfill request to queue: {Symbol} (queue: {Queue})",
            request.Symbol, _rabbitSettings.CryptoQueueName);
    }
}

// Response DTOs
public class FetchResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Symbol { get; set; }
    public string? Date { get; set; }
    public int? RecordsInserted { get; set; }
}

public class StatusResponse
{
    public string Service { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public ConfigInfo DefaultConfig { get; set; } = new();
}

public class ConfigInfo
{
    public string FetchDate { get; set; } = string.Empty;
    public string Interval { get; set; } = string.Empty;
    public int OutputSize { get; set; }
    public string Exchange { get; set; } = string.Empty;
    public string Timezone { get; set; } = string.Empty;
}

public class BatchFetchResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Date { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int TotalRecordsInserted { get; set; }
    public List<SymbolFetchResult>? Results { get; set; }
}

public class SymbolFetchResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int RecordsInserted { get; set; }
    public string? Error { get; set; }
}

