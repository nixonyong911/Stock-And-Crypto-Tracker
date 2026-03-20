using System.Text;
using Dapper;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public class CryptoIndicatorRepository : ICryptoIndicatorRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoIndicatorRepository> _logger;
    private const int BatchSize = 100;

    public CryptoIndicatorRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoIndicatorRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task BulkUpsertAsync(IEnumerable<CryptoIndicator> indicators)
    {
        var list = indicators.ToList();
        if (list.Count == 0) return;

        using var connection = _connectionFactory.CreateConnection();

        foreach (var batch in list.Chunk(BatchSize))
        {
            var sb = new StringBuilder();
            sb.Append(@"INSERT INTO analysis_indicators_crypto_free
                (crypto_ticker_id, data_source_id, indicator_time, sma, ema, macd_value, macd_signal, macd_histogram, rsi)
                VALUES ");

            var parameters = new DynamicParameters();
            for (var i = 0; i < batch.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append($"(@t{i},@d{i},@it{i},@s{i},@e{i},@mv{i},@ms{i},@mh{i},@r{i})");
                parameters.Add($"t{i}", batch[i].CryptoTickerId);
                parameters.Add($"d{i}", batch[i].DataSourceId);
                parameters.Add($"it{i}", batch[i].IndicatorTime);
                parameters.Add($"s{i}", batch[i].Sma);
                parameters.Add($"e{i}", batch[i].Ema);
                parameters.Add($"mv{i}", batch[i].MacdValue);
                parameters.Add($"ms{i}", batch[i].MacdSignal);
                parameters.Add($"mh{i}", batch[i].MacdHistogram);
                parameters.Add($"r{i}", batch[i].Rsi);
            }

            sb.Append(@" ON CONFLICT (crypto_ticker_id, data_source_id, indicator_time) DO UPDATE SET
                sma = COALESCE(EXCLUDED.sma, analysis_indicators_crypto_free.sma),
                ema = COALESCE(EXCLUDED.ema, analysis_indicators_crypto_free.ema),
                macd_value = COALESCE(EXCLUDED.macd_value, analysis_indicators_crypto_free.macd_value),
                macd_signal = COALESCE(EXCLUDED.macd_signal, analysis_indicators_crypto_free.macd_signal),
                macd_histogram = COALESCE(EXCLUDED.macd_histogram, analysis_indicators_crypto_free.macd_histogram),
                rsi = COALESCE(EXCLUDED.rsi, analysis_indicators_crypto_free.rsi)");

            await connection.ExecuteAsync(sb.ToString(), parameters);
        }

        _logger.LogDebug("Bulk upserted {Count} crypto indicator records in {Batches} batches", list.Count, (list.Count + BatchSize - 1) / BatchSize);
    }

    public async Task DeleteOldRecordsAsync(int cryptoTickerId, int retentionDays = 90)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "DELETE FROM analysis_indicators_crypto_free WHERE crypto_ticker_id = @CryptoTickerId AND indicator_time < NOW() - make_interval(days => @RetentionDays)";

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
            FROM analysis_indicators_crypto_free
            WHERE crypto_ticker_id = @CryptoTickerId
              AND indicator_time::date = @Date
            ORDER BY indicator_time";

        return await connection.QueryAsync<CryptoIndicator>(sql, new { CryptoTickerId = cryptoTickerId, Date = date });
    }
}
