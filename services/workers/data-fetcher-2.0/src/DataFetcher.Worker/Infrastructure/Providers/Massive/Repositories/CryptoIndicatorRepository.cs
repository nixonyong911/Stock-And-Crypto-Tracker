using Dapper;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public class CryptoIndicatorRepository : ICryptoIndicatorRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoIndicatorRepository> _logger;

    public CryptoIndicatorRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoIndicatorRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task BulkUpsertAsync(IEnumerable<CryptoIndicator> indicators)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_crypto_indicator
                (crypto_ticker_id, data_source_id, indicator_time, sma, ema, macd_value, macd_signal, macd_histogram, rsi)
            VALUES
                (@CryptoTickerId, @DataSourceId, @IndicatorTime, @Sma, @Ema, @MacdValue, @MacdSignal, @MacdHistogram, @Rsi)
            ON CONFLICT (crypto_ticker_id, data_source_id, indicator_time) DO UPDATE SET
                sma = COALESCE(EXCLUDED.sma, analysis_crypto_indicator.sma),
                ema = COALESCE(EXCLUDED.ema, analysis_crypto_indicator.ema),
                macd_value = COALESCE(EXCLUDED.macd_value, analysis_crypto_indicator.macd_value),
                macd_signal = COALESCE(EXCLUDED.macd_signal, analysis_crypto_indicator.macd_signal),
                macd_histogram = COALESCE(EXCLUDED.macd_histogram, analysis_crypto_indicator.macd_histogram),
                rsi = COALESCE(EXCLUDED.rsi, analysis_crypto_indicator.rsi)";

        await connection.ExecuteAsync(sql, indicators);
        _logger.LogDebug("Bulk upserted {Count} crypto indicator records", indicators.Count());
    }

    public async Task DeleteOldRecordsAsync(int cryptoTickerId, int retentionDays = 90)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "DELETE FROM analysis_crypto_indicator WHERE crypto_ticker_id = @CryptoTickerId AND indicator_time < NOW() - make_interval(days => @RetentionDays)";

        var deleted = await connection.ExecuteAsync(sql, new { CryptoTickerId = cryptoTickerId, RetentionDays = retentionDays });
        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} old crypto indicator records for ticker {TickerId}", deleted, cryptoTickerId);
        }
    }

    public async Task<IEnumerable<CryptoIndicator>> GetByTickerAndDateAsync(int cryptoTickerId, DateTime date)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                crypto_ticker_id as CryptoTickerId,
                data_source_id as DataSourceId,
                indicator_time as IndicatorTime,
                sma as Sma,
                ema as Ema,
                macd_value as MacdValue,
                macd_signal as MacdSignal,
                macd_histogram as MacdHistogram,
                rsi as Rsi,
                created_at as CreatedAt
            FROM analysis_crypto_indicator
            WHERE crypto_ticker_id = @CryptoTickerId
              AND indicator_time::date = @Date
            ORDER BY indicator_time";

        return await connection.QueryAsync<CryptoIndicator>(sql, new { CryptoTickerId = cryptoTickerId, Date = date });
    }
}
