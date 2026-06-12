using Dapper;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

public class Crypto52WeekRangeRepository : ICrypto52WeekRangeRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<Crypto52WeekRangeRepository> _logger;

    public Crypto52WeekRangeRepository(IDbConnectionFactory connectionFactory, ILogger<Crypto52WeekRangeRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task UpsertAsync(Crypto52WeekRange range)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_crypto_range_52w
                (crypto_ticker_id, week_52_high, week_52_low,
                 week_52_high_date, week_52_low_date, coverage_days, computed_at)
            VALUES
                (@CryptoTickerId, @Week52High, @Week52Low,
                 @Week52HighDate, @Week52LowDate, @CoverageDays, NOW())
            ON CONFLICT (crypto_ticker_id)
            DO UPDATE SET
                week_52_high = EXCLUDED.week_52_high,
                week_52_low = EXCLUDED.week_52_low,
                week_52_high_date = EXCLUDED.week_52_high_date,
                week_52_low_date = EXCLUDED.week_52_low_date,
                coverage_days = EXCLUDED.coverage_days,
                computed_at = NOW()";

        await connection.ExecuteAsync(sql, range);
        _logger.LogDebug("Upserted 52-week range for crypto ticker {TickerId}", range.CryptoTickerId);
    }

    /// <inheritdoc />
    public async Task<IReadOnlySet<int>> GetComputedSinceAsync(DateTime sinceUtc)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT crypto_ticker_id
            FROM analysis_crypto_range_52w
            WHERE computed_at >= @SinceUtc";

        var ids = await connection.QueryAsync<int>(sql, new { SinceUtc = sinceUtc });
        return ids.ToHashSet();
    }
}
