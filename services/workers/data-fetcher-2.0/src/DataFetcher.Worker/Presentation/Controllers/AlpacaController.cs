using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace DataFetcher.Worker.Presentation.Controllers;

[ApiController]
[Route("api/alpaca")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "alpaca")]
public class AlpacaController : ControllerBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<AlpacaController> _logger;

    public AlpacaController(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<AlpacaController> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        try
        {
            return Ok(new { provider = "Alpaca", status = "running", timestamp = DateTime.UtcNow });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetStatus");
            return StatusCode(500, new { message = "Failed to retrieve Alpaca status", error = ex.Message });
        }
    }

    [HttpPost("trigger/stocks")]
    public async Task<IActionResult> TriggerStockFetch(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IAlpacaStockFetchService>();
            var records = await service.FetchLatestStockDataAsync(cancellationToken: cancellationToken);
            return Ok(new { message = $"Fetched {records} stock records", records });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in TriggerStockFetch");
            return StatusCode(500, new { message = "Failed to fetch stock data", error = ex.Message });
        }
    }

    [HttpPost("trigger/crypto")]
    public async Task<IActionResult> TriggerCryptoFetch(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IAlpacaCryptoFetchService>();
            var records = await service.FetchLatestCryptoDataAsync(cancellationToken: cancellationToken);
            return Ok(new { message = $"Fetched {records} crypto records", records });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in TriggerCryptoFetch");
            return StatusCode(500, new { message = "Failed to fetch crypto data", error = ex.Message });
        }
    }

    [HttpPost("backfill/{symbol}")]
    public IActionResult QueueStockBackfill(string symbol)
    {
        try
        {
            var request = new AlpacaBackfillRequest { Symbol = symbol.ToUpperInvariant(), AssetType = "stock", RequestedAt = DateTime.UtcNow };
            PublishToQueue(_rabbitSettings.BackfillQueueName, request);
            return Accepted(new { message = $"Stock backfill queued for {symbol}", symbol });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in QueueStockBackfill");
            return StatusCode(500, new { message = "Failed to queue stock backfill", error = ex.Message });
        }
    }

    [HttpPost("crypto/backfill/{symbol}")]
    public IActionResult QueueCryptoBackfill(string symbol)
    {
        try
        {
            var normalized = symbol.ToUpperInvariant();
            if (!normalized.Contains('/')) normalized = $"{normalized}/USD";
            var request = new AlpacaBackfillRequest { Symbol = normalized, AssetType = "crypto", RequestedAt = DateTime.UtcNow };
            PublishToQueue(_rabbitSettings.CryptoBackfillQueueName, request);
            return Accepted(new { message = $"Crypto backfill queued for {normalized}", symbol = normalized });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in QueueCryptoBackfill");
            return StatusCode(500, new { message = "Failed to queue crypto backfill", error = ex.Message });
        }
    }

    [HttpPost("backfill/all")]
    public async Task<IActionResult> BackfillAll(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var stockTickerRepo = scope.ServiceProvider.GetRequiredService<IStockTickerRepository>();
            var cryptoTickerRepo = scope.ServiceProvider.GetRequiredService<ICryptoTickerRepository>();

            var stockTickers = (await stockTickerRepo.GetActiveTickersAsync()).ToList();
            var cryptoTickers = (await cryptoTickerRepo.GetActiveTickersAsync()).ToList();

            foreach (var ticker in stockTickers)
            {
                var request = new AlpacaBackfillRequest { Symbol = ticker.Symbol, Exchange = ticker.Exchange, AssetType = "stock", TickerId = ticker.Id, RequestedAt = DateTime.UtcNow };
                PublishToQueue(_rabbitSettings.BackfillQueueName, request);
            }

            foreach (var ticker in cryptoTickers)
            {
                var request = new AlpacaBackfillRequest { Symbol = ticker.Symbol, AssetType = "crypto", TickerId = ticker.Id, RequestedAt = DateTime.UtcNow };
                PublishToQueue(_rabbitSettings.CryptoBackfillQueueName, request);
            }

            return Accepted(new
            {
                message = $"Queued backfill for {stockTickers.Count} stocks and {cryptoTickers.Count} crypto tickers",
                stockCount = stockTickers.Count,
                cryptoCount = cryptoTickers.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in BackfillAll");
            return StatusCode(500, new { message = "Failed to queue backfill for all tickers", error = ex.Message });
        }
    }

    [HttpPost("webhook/new-ticker")]
    public IActionResult HandleNewTickerWebhook([FromBody] JsonElement body)
    {
        try
        {
            var record = body.GetProperty("record");
            var symbol = record.GetProperty("symbol").GetString();
            var exchange = record.TryGetProperty("exchange", out var ex) ? ex.GetString() : "NASDAQ";

            if (string.IsNullOrEmpty(symbol))
                return BadRequest(new { message = "Missing symbol" });

            var request = new AlpacaBackfillRequest { Symbol = symbol, Exchange = exchange, AssetType = "stock", RequestedAt = DateTime.UtcNow };
            PublishToQueue(_rabbitSettings.BackfillQueueName, request);
            _logger.LogInformation("New stock ticker webhook: queued backfill for {Symbol}", symbol);
            return Ok(new { message = $"Backfill queued for {symbol}" });
        }
        catch (Exception ex2)
        {
            _logger.LogError(ex2, "Error processing new ticker webhook");
            return BadRequest(new { message = ex2.Message });
        }
    }

    [HttpPost("webhook/new-crypto-ticker")]
    public IActionResult HandleNewCryptoTickerWebhook([FromBody] JsonElement body)
    {
        try
        {
            var record = body.GetProperty("record");
            var symbol = record.GetProperty("symbol").GetString();

            if (string.IsNullOrEmpty(symbol))
                return BadRequest(new { message = "Missing symbol" });

            var request = new AlpacaBackfillRequest { Symbol = symbol, AssetType = "crypto", RequestedAt = DateTime.UtcNow };
            PublishToQueue(_rabbitSettings.CryptoBackfillQueueName, request);
            _logger.LogInformation("New crypto ticker webhook: queued backfill for {Symbol}", symbol);
            return Ok(new { message = $"Backfill queued for {symbol}" });
        }
        catch (Exception ex2)
        {
            _logger.LogError(ex2, "Error processing new crypto ticker webhook");
            return BadRequest(new { message = ex2.Message });
        }
    }

    private void PublishToQueue(string queueName, object message)
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
        channel.QueueDeclare(queue: queueName, durable: true, exclusive: false, autoDelete: false);

        var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message));
        var properties = channel.CreateBasicProperties();
        properties.Persistent = true;

        channel.BasicPublish(exchange: "", routingKey: queueName, basicProperties: properties, body: body);
    }
}
