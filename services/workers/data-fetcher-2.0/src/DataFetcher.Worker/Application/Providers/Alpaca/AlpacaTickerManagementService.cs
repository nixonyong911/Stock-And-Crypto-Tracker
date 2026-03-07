using Dapper;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common;
using Microsoft.Extensions.Logging;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaTickerManagementService : IAlpacaTickerManagementService
{
    private readonly IAlpacaAssetVerificationService _verificationService;
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<AlpacaTickerManagementService> _logger;

    public AlpacaTickerManagementService(
        IAlpacaAssetVerificationService verificationService,
        IDbConnectionFactory connectionFactory,
        ILogger<AlpacaTickerManagementService> logger)
    {
        _verificationService = verificationService;
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<AlpacaAddTickerResult> AddTickerAsync(AlpacaAddTickerRequest request, CancellationToken cancellationToken = default)
    {
        var symbol = request.Symbol.ToUpperInvariant().Trim();
        var assetType = request.AssetType;

        if (assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase))
        {
            if (!symbol.Contains('/'))
                symbol = $"{symbol}/USD";
        }

        var verification = await _verificationService.VerifyAsync(symbol, assetType, cancellationToken);

        if (!verification.Found)
        {
            if (verification.Error != null)
            {
                return new AlpacaAddTickerResult
                {
                    ResultCode = "ERROR",
                    Message = verification.Error,
                    ErrorCode = "VALIDATION_ERROR"
                };
            }

            return new AlpacaAddTickerResult
            {
                ResultCode = "NOT_FOUND",
                Message = $"Symbol '{symbol}' not found in Alpaca catalog",
                ErrorCode = "NOT_FOUND"
            };
        }

        using var connection = _connectionFactory.CreateConnection();

        if (assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase))
        {
            var existing = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT id, symbol, name, is_active FROM crypto_tickers WHERE symbol = @Symbol",
                new { Symbol = symbol });

            if (existing != null)
            {
                if (!(bool)existing.is_active)
                {
                    await connection.ExecuteAsync(
                        "UPDATE crypto_tickers SET is_active = true, updated_at = @Now WHERE id = @Id",
                        new { Id = (int)existing.id, Now = DateTime.UtcNow });

                    return new AlpacaAddTickerResult
                    {
                        ResultCode = "SUCCESS",
                        Message = "Ticker re-enabled successfully",
                        Data = new AlpacaTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name }
                    };
                }

                return new AlpacaAddTickerResult
                {
                    ResultCode = "SUCCESS",
                    Message = "Ticker already exists and is active",
                    Data = new AlpacaTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name }
                };
            }

            var id = await connection.QuerySingleAsync<int>(@"
                INSERT INTO crypto_tickers (universe_id, symbol, name, is_active, created_at, updated_at)
                VALUES (3, @Symbol, @Name, true, @Now, @Now)
                RETURNING id",
                new { Symbol = symbol, Name = verification.Name ?? symbol, Now = DateTime.UtcNow });

            _logger.LogInformation("Created crypto ticker {Symbol} (ID: {Id})", symbol, id);

            return new AlpacaAddTickerResult
            {
                ResultCode = "CREATED",
                Message = "Ticker created successfully",
                Data = new AlpacaTickerData { Id = id, Symbol = symbol, Name = verification.Name }
            };
        }
        else
        {
            var existing = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT id, symbol, name, exchange, is_active FROM stock_tickers WHERE symbol = @Symbol",
                new { Symbol = symbol });

            if (existing != null)
            {
                if (!(bool)existing.is_active)
                {
                    await connection.ExecuteAsync(
                        "UPDATE stock_tickers SET is_active = true, updated_at = @Now WHERE id = @Id",
                        new { Id = (int)existing.id, Now = DateTime.UtcNow });

                    return new AlpacaAddTickerResult
                    {
                        ResultCode = "SUCCESS",
                        Message = "Ticker re-enabled successfully",
                        Data = new AlpacaTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name, Exchange = (string?)existing.exchange }
                    };
                }

                return new AlpacaAddTickerResult
                {
                    ResultCode = "SUCCESS",
                    Message = "Ticker already exists and is active",
                    Data = new AlpacaTickerData { Id = (int)existing.id, Symbol = symbol, Name = (string?)existing.name, Exchange = (string?)existing.exchange }
                };
            }

            var exchange = verification.Exchange ?? "NASDAQ";
            var id = await connection.QuerySingleAsync<int>(@"
                INSERT INTO stock_tickers (universe_id, symbol, name, exchange, currency, is_active, created_at, updated_at)
                VALUES (1, @Symbol, @Name, @Exchange, 'USD', true, @Now, @Now)
                RETURNING id",
                new { Symbol = symbol, Name = verification.Name ?? symbol, Exchange = exchange, Now = DateTime.UtcNow });

            _logger.LogInformation("Created stock ticker {Symbol} (ID: {Id}) on {Exchange}", symbol, id, exchange);

            return new AlpacaAddTickerResult
            {
                ResultCode = "CREATED",
                Message = "Ticker created successfully",
                Data = new AlpacaTickerData { Id = id, Symbol = symbol, Name = verification.Name, Exchange = exchange }
            };
        }
    }

    public async Task<AlpacaAddTickerResult> ToggleTickerAsync(int id, string assetType, CancellationToken cancellationToken = default)
    {
        using var connection = _connectionFactory.CreateConnection();

        var table = assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase) ? "crypto_tickers" : "stock_tickers";

        var ticker = await connection.QueryFirstOrDefaultAsync<dynamic>(
            $"SELECT id, symbol, is_active FROM {table} WHERE id = @Id",
            new { Id = id });

        if (ticker == null)
        {
            return new AlpacaAddTickerResult
            {
                ResultCode = "NOT_FOUND",
                Message = "Ticker not found",
                ErrorCode = "NOT_FOUND"
            };
        }

        var newStatus = !(bool)ticker.is_active;
        await connection.ExecuteAsync(
            $"UPDATE {table} SET is_active = @IsActive, updated_at = @Now WHERE id = @Id",
            new { Id = id, IsActive = newStatus, Now = DateTime.UtcNow });

        return new AlpacaAddTickerResult
        {
            ResultCode = "SUCCESS",
            Message = newStatus ? "Ticker re-enabled successfully" : "Ticker disabled successfully",
            Data = new AlpacaTickerData { Id = id, Symbol = (string)ticker.symbol }
        };
    }
}
