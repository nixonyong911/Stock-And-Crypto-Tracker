using System.Text;
using System.Text.Json;
using Dapper;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace DataFetcher.Worker.Application.Providers.Common;

public class TickerManagementService : ITickerManagementService
{
    private readonly IMarketDataResolver _resolver;
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<TickerManagementService> _logger;

    public TickerManagementService(
        IMarketDataResolver resolver,
        IDbConnectionFactory connectionFactory,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<TickerManagementService> logger)
    {
        _resolver = resolver;
        _connectionFactory = connectionFactory;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    public async Task<AddTickerResult> AddTickerAsync(AddTickerRequest request, CancellationToken ct = default)
    {
        var symbol = request.Symbol.ToUpperInvariant().Trim();
        var assetType = request.AssetType;

        if (assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase) && !symbol.Contains('/'))
            symbol = $"{symbol}/USD";

        var resolveResult = await _resolver.VerifyAndResolveAsync(symbol, assetType, ct);

        if (!resolveResult.Found)
        {
            if (resolveResult.Error != null)
            {
                return new AddTickerResult
                {
                    ResultCode = "ERROR",
                    Message = resolveResult.Error,
                    ErrorCode = "VALIDATION_ERROR"
                };
            }

            return new AddTickerResult
            {
                ResultCode = "NOT_FOUND",
                Message = $"Symbol '{symbol}' not found on any provider",
                ErrorCode = "NOT_FOUND"
            };
        }

        using var connection = _connectionFactory.CreateConnection();

        var isCrypto = assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase);
        var isStock = !isCrypto;

        if (isCrypto)
            return await UpsertCryptoTickerAsync(connection, symbol, resolveResult);
        else
            return await UpsertStockTickerAsync(connection, symbol, assetType, resolveResult);
    }

    private async Task<AddTickerResult> UpsertStockTickerAsync(
        System.Data.IDbConnection connection, string symbol, string assetType, ResolveResult resolve)
    {
        var existing = await connection.QueryFirstOrDefaultAsync<dynamic>(
            "SELECT id, symbol, name, exchange, is_active FROM stock_tickers WHERE symbol = @Symbol",
            new { Symbol = symbol });

        if (existing != null)
        {
            if (!(bool)existing.is_active)
            {
                await connection.ExecuteAsync(
                    @"UPDATE stock_tickers SET is_active = true, preferred_data_source_id = @DsId,
                      etoro_instrument_id = COALESCE(@EtoroId, etoro_instrument_id), updated_at = @Now WHERE id = @Id",
                    new { Id = (int)existing.id, DsId = resolve.PreferredDataSourceId, EtoroId = resolve.EtoroInstrumentId, Now = DateTime.UtcNow });

                return MakeResult("SUCCESS", "Ticker re-enabled successfully", resolve,
                    new AddTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name, Exchange = (string?)existing.exchange });
            }

            if (resolve.EtoroInstrumentId.HasValue)
            {
                await connection.ExecuteAsync(
                    "UPDATE stock_tickers SET etoro_instrument_id = COALESCE(etoro_instrument_id, @EtoroId), updated_at = @Now WHERE id = @Id",
                    new { Id = (int)existing.id, EtoroId = resolve.EtoroInstrumentId, Now = DateTime.UtcNow });
            }

            return MakeResult("SUCCESS", "Ticker already exists and is active", resolve,
                new AddTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name, Exchange = (string?)existing.exchange });
        }

        var universeId = assetType.Equals("Etf", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
        var exchange = resolve.Exchange ?? "UNKNOWN";

        var id = await connection.QuerySingleAsync<int>(@"
            INSERT INTO stock_tickers (universe_id, symbol, name, exchange, currency, is_active, preferred_data_source_id, etoro_instrument_id, created_at, updated_at)
            VALUES (@UniverseId, @Symbol, @Name, @Exchange, 'USD', true, @DsId, @EtoroId, @Now, @Now)
            RETURNING id",
            new { UniverseId = universeId, Symbol = symbol, Name = resolve.Name ?? symbol, Exchange = exchange,
                  DsId = resolve.PreferredDataSourceId, EtoroId = resolve.EtoroInstrumentId, Now = DateTime.UtcNow });

        _logger.LogInformation("Created stock ticker {Symbol} (ID: {Id}) via {Provider}", symbol, id, resolve.PrimaryProvider);
        QueueBackfill(symbol, "stock", id, resolve.EtoroInstrumentId);

        return MakeResult("CREATED", "Ticker created successfully", resolve,
            new AddTickerData { Id = id, Symbol = symbol, Name = resolve.Name, Exchange = exchange });
    }

    private async Task<AddTickerResult> UpsertCryptoTickerAsync(
        System.Data.IDbConnection connection, string symbol, ResolveResult resolve)
    {
        var existing = await connection.QueryFirstOrDefaultAsync<dynamic>(
            "SELECT id, symbol, name, is_active FROM crypto_tickers WHERE symbol = @Symbol",
            new { Symbol = symbol });

        if (existing != null)
        {
            if (!(bool)existing.is_active)
            {
                await connection.ExecuteAsync(
                    @"UPDATE crypto_tickers SET is_active = true, preferred_data_source_id = @DsId,
                      etoro_instrument_id = COALESCE(@EtoroId, etoro_instrument_id), updated_at = @Now WHERE id = @Id",
                    new { Id = (int)existing.id, DsId = resolve.PreferredDataSourceId, EtoroId = resolve.EtoroInstrumentId, Now = DateTime.UtcNow });

                return MakeResult("SUCCESS", "Ticker re-enabled successfully", resolve,
                    new AddTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name });
            }

            if (resolve.EtoroInstrumentId.HasValue)
            {
                await connection.ExecuteAsync(
                    "UPDATE crypto_tickers SET etoro_instrument_id = COALESCE(etoro_instrument_id, @EtoroId), updated_at = @Now WHERE id = @Id",
                    new { Id = (int)existing.id, EtoroId = resolve.EtoroInstrumentId, Now = DateTime.UtcNow });
            }

            return MakeResult("SUCCESS", "Ticker already exists and is active", resolve,
                new AddTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name });
        }

        var id = await connection.QuerySingleAsync<int>(@"
            INSERT INTO crypto_tickers (universe_id, symbol, name, is_active, preferred_data_source_id, etoro_instrument_id, created_at, updated_at)
            VALUES (3, @Symbol, @Name, true, @DsId, @EtoroId, @Now, @Now)
            RETURNING id",
            new { Symbol = symbol, Name = resolve.Name ?? symbol, DsId = resolve.PreferredDataSourceId,
                  EtoroId = resolve.EtoroInstrumentId, Now = DateTime.UtcNow });

        _logger.LogInformation("Created crypto ticker {Symbol} (ID: {Id}) via {Provider}", symbol, id, resolve.PrimaryProvider);
        QueueBackfill(symbol, "crypto", id, resolve.EtoroInstrumentId);

        return MakeResult("CREATED", "Ticker created successfully", resolve,
            new AddTickerData { Id = id, Symbol = symbol, Name = resolve.Name });
    }

    private void QueueBackfill(string symbol, string assetType, int tickerId, int? etoroInstrumentId)
    {
        try
        {
            var queueName = assetType.Equals("crypto", StringComparison.OrdinalIgnoreCase)
                ? _rabbitSettings.CryptoBackfillQueueName
                : _rabbitSettings.BackfillQueueName;

            var request = new AlpacaBackfillRequest
            {
                Symbol = symbol,
                AssetType = assetType,
                TickerId = tickerId,
                RequestedAt = DateTime.UtcNow
            };

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

            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request));
            var properties = channel.CreateBasicProperties();
            properties.Persistent = true;

            channel.BasicPublish(exchange: "", routingKey: queueName, basicProperties: properties, body: body);
            _logger.LogInformation("Queued backfill for {Symbol} ({AssetType}) on queue {Queue}", symbol, assetType, queueName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to queue backfill for {Symbol} (non-fatal)", symbol);
        }
    }

    private static AddTickerResult MakeResult(string code, string message, ResolveResult resolve, AddTickerData data) =>
        new()
        {
            ResultCode = code,
            Message = message,
            Provider = resolve.PrimaryProvider,
            Data = data
        };
}
