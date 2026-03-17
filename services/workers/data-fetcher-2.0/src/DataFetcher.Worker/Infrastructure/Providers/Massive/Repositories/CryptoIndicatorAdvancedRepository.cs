using System.Text;
using Dapper;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public class CryptoIndicatorAdvancedRepository : ICryptoIndicatorAdvancedRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoIndicatorAdvancedRepository> _logger;
    private const int BatchSize = 100;

    public CryptoIndicatorAdvancedRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoIndicatorAdvancedRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task BulkUpsertAsync(IEnumerable<CryptoIndicatorAdvanced> indicators)
    {
        var list = indicators.ToList();
        if (list.Count == 0) return;

        using var connection = _connectionFactory.CreateConnection();

        foreach (var batch in list.Chunk(BatchSize))
        {
            var sb = new StringBuilder();
            sb.Append(@"INSERT INTO analysis_crypto_indicator_advanced
                (crypto_ticker_id, data_source_id, indicator_time,
                 bollinger_upper, bollinger_lower, bollinger_middle, bollinger_bandwidth, atr,
                 stoch_k, stoch_d, adx, obv,
                 fibonacci_levels, pivot_levels,
                 ichimoku_tenkan, ichimoku_kijun, ichimoku_senkou_a, ichimoku_senkou_b, ichimoku_chikou)
                VALUES ");

            var parameters = new DynamicParameters();
            for (var i = 0; i < batch.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append($"(@t{i},@d{i},@it{i},@bu{i},@bl{i},@bm{i},@bw{i},@atr{i},@sk{i},@sd{i},@adx{i},@obv{i},@fl{i}::jsonb,@pl{i}::jsonb,@ikt{i},@ikk{i},@isa{i},@isb{i},@ic{i})");
                parameters.Add($"t{i}", batch[i].CryptoTickerId);
                parameters.Add($"d{i}", batch[i].DataSourceId);
                parameters.Add($"it{i}", batch[i].IndicatorTime);
                parameters.Add($"bu{i}", batch[i].BollingerUpper);
                parameters.Add($"bl{i}", batch[i].BollingerLower);
                parameters.Add($"bm{i}", batch[i].BollingerMiddle);
                parameters.Add($"bw{i}", batch[i].BollingerBandwidth);
                parameters.Add($"atr{i}", batch[i].Atr);
                parameters.Add($"sk{i}", batch[i].StochK);
                parameters.Add($"sd{i}", batch[i].StochD);
                parameters.Add($"adx{i}", batch[i].Adx);
                parameters.Add($"obv{i}", batch[i].Obv);
                parameters.Add($"fl{i}", batch[i].FibonacciLevels);
                parameters.Add($"pl{i}", batch[i].PivotLevels);
                parameters.Add($"ikt{i}", batch[i].IchimokuTenkan);
                parameters.Add($"ikk{i}", batch[i].IchimokuKijun);
                parameters.Add($"isa{i}", batch[i].IchimokuSenkouA);
                parameters.Add($"isb{i}", batch[i].IchimokuSenkouB);
                parameters.Add($"ic{i}", batch[i].IchimokuChikou);
            }

            sb.Append(@" ON CONFLICT (crypto_ticker_id, data_source_id, indicator_time) DO UPDATE SET
                bollinger_upper = COALESCE(EXCLUDED.bollinger_upper, analysis_crypto_indicator_advanced.bollinger_upper),
                bollinger_lower = COALESCE(EXCLUDED.bollinger_lower, analysis_crypto_indicator_advanced.bollinger_lower),
                bollinger_middle = COALESCE(EXCLUDED.bollinger_middle, analysis_crypto_indicator_advanced.bollinger_middle),
                bollinger_bandwidth = COALESCE(EXCLUDED.bollinger_bandwidth, analysis_crypto_indicator_advanced.bollinger_bandwidth),
                atr = COALESCE(EXCLUDED.atr, analysis_crypto_indicator_advanced.atr),
                stoch_k = COALESCE(EXCLUDED.stoch_k, analysis_crypto_indicator_advanced.stoch_k),
                stoch_d = COALESCE(EXCLUDED.stoch_d, analysis_crypto_indicator_advanced.stoch_d),
                adx = COALESCE(EXCLUDED.adx, analysis_crypto_indicator_advanced.adx),
                obv = COALESCE(EXCLUDED.obv, analysis_crypto_indicator_advanced.obv),
                fibonacci_levels = COALESCE(EXCLUDED.fibonacci_levels, analysis_crypto_indicator_advanced.fibonacci_levels),
                pivot_levels = COALESCE(EXCLUDED.pivot_levels, analysis_crypto_indicator_advanced.pivot_levels),
                ichimoku_tenkan = COALESCE(EXCLUDED.ichimoku_tenkan, analysis_crypto_indicator_advanced.ichimoku_tenkan),
                ichimoku_kijun = COALESCE(EXCLUDED.ichimoku_kijun, analysis_crypto_indicator_advanced.ichimoku_kijun),
                ichimoku_senkou_a = COALESCE(EXCLUDED.ichimoku_senkou_a, analysis_crypto_indicator_advanced.ichimoku_senkou_a),
                ichimoku_senkou_b = COALESCE(EXCLUDED.ichimoku_senkou_b, analysis_crypto_indicator_advanced.ichimoku_senkou_b),
                ichimoku_chikou = COALESCE(EXCLUDED.ichimoku_chikou, analysis_crypto_indicator_advanced.ichimoku_chikou)");

            await connection.ExecuteAsync(sb.ToString(), parameters);
        }

        _logger.LogDebug("Bulk upserted {Count} advanced crypto indicator records in {Batches} batches", list.Count, (list.Count + BatchSize - 1) / BatchSize);
    }

    public async Task DeleteOldRecordsAsync(int cryptoTickerId, int retentionDays = 90)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "DELETE FROM analysis_crypto_indicator_advanced WHERE crypto_ticker_id = @CryptoTickerId AND indicator_time < NOW() - make_interval(days => @RetentionDays)";

        var deleted = await connection.ExecuteAsync(sql, new { CryptoTickerId = cryptoTickerId, RetentionDays = retentionDays });
        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} old advanced indicator records for crypto ticker {TickerId}", deleted, cryptoTickerId);
        }
    }
}
