using Dapper;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;

public class InsiderTradingRepository : IInsiderTradingRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<InsiderTradingRepository> _logger;

    public InsiderTradingRepository(IDbConnectionFactory connectionFactory, ILogger<InsiderTradingRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<int> BulkUpsertAsync(int stockTickerId, string symbol, List<InsiderTransaction> transactions)
    {
        if (transactions.Count == 0) return 0;

        using var connection = _connectionFactory.CreateConnection();
        var inserted = 0;

        const string sql = @"
            INSERT INTO analysis_insider_trading_transactions (
                stock_ticker_id, symbol, finnhub_id, insider_name, transaction_code,
                shares_changed, shares_after, transaction_price, transaction_date,
                filing_date, is_derivative
            ) VALUES (
                @StockTickerId, @Symbol, @FinnhubId, @InsiderName, @TransactionCode,
                @SharesChanged, @SharesAfter, @TransactionPrice, @TransactionDate::date,
                @FilingDate::date, @IsDerivative
            )
            ON CONFLICT (finnhub_id) DO NOTHING";

        foreach (var txn in transactions)
        {
            if (string.IsNullOrWhiteSpace(txn.Id) || string.IsNullOrWhiteSpace(txn.Name))
                continue;

            try
            {
                var rows = await connection.ExecuteAsync(sql, new
                {
                    StockTickerId = stockTickerId,
                    Symbol = symbol,
                    FinnhubId = txn.Id,
                    InsiderName = txn.Name,
                    TransactionCode = txn.TransactionCode ?? "?",
                    SharesChanged = txn.Change,
                    SharesAfter = txn.Share,
                    TransactionPrice = txn.TransactionPrice,
                    TransactionDate = txn.TransactionDate,
                    FilingDate = txn.FilingDate,
                    IsDerivative = txn.IsDerivative
                });
                inserted += rows;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to insert insider transaction {Id} for {Symbol}", txn.Id, symbol);
            }
        }

        if (inserted > 0)
            _logger.LogDebug("Inserted {Count} insider trading transactions for {Symbol}", inserted, symbol);

        return inserted;
    }

    public async Task<int> CleanupOldTransactionsAsync(int retentionDays = 90)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            DELETE FROM analysis_insider_trading_transactions
            WHERE transaction_date < CURRENT_DATE - @RetentionDays::int";

        var deleted = await connection.ExecuteAsync(sql, new { RetentionDays = retentionDays });

        if (deleted > 0)
            _logger.LogInformation("Cleaned up {Count} insider trading transactions older than {Days} days", deleted, retentionDays);

        return deleted;
    }
}
