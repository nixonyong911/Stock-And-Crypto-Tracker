using System.Text.Json;
using Dapper;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public class CryptoPriceTargetRepository : ICryptoPriceTargetRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoPriceTargetRepository> _logger;

    public CryptoPriceTargetRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoPriceTargetRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<IEnumerable<(DateOnly Date, decimal Close, decimal? Open)>> GetRecentDailyClosesAsync(int cryptoTickerId, DateOnly asOfDate, int days)
    {
        const string sql = @"
            SELECT analysis_date AS Date, daily_close AS Close, daily_open AS Open
            FROM analysis_crypto_candlestick_pattern
            WHERE crypto_ticker_id = @CryptoTickerId
              AND analysis_date <= @AsOfDate
              AND daily_close IS NOT NULL
            ORDER BY analysis_date DESC
            LIMIT @Days";

        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync<DailyCloseRow>(sql, new
        {
            CryptoTickerId = cryptoTickerId,
            AsOfDate = asOfDate,
            Days = days
        });

        return rows.Select(r => (DateOnly.FromDateTime(r.Date), r.Close, r.Open));
    }

    public async Task<(decimal? Ema20, decimal? Ema50, decimal? Rsi)?> GetLatestIndicatorAsync(int cryptoTickerId, DateOnly asOfDate)
    {
        const string sql = @"
            SELECT ema AS Ema, sma AS Sma, rsi AS Rsi
            FROM analysis_indicators_crypto_free
            WHERE crypto_ticker_id = @CryptoTickerId
              AND indicator_time <= @AsOfDate::date + interval '1 day'
            ORDER BY indicator_time DESC
            LIMIT 1";

        using var connection = _connectionFactory.CreateConnection();
        var row = await connection.QueryFirstOrDefaultAsync<IndicatorRow>(sql, new
        {
            CryptoTickerId = cryptoTickerId,
            AsOfDate = asOfDate
        });

        if (row == null) return null;

        return (row.Ema, row.Sma, row.Rsi);
    }

    public async Task<IEnumerable<string>> GetRecentCandleSignalsAsync(int cryptoTickerId, DateOnly asOfDate, int days)
    {
        const string sql = @"
            SELECT detected_patterns::text AS PatternsJson
            FROM analysis_crypto_candlestick_pattern
            WHERE crypto_ticker_id = @CryptoTickerId
              AND analysis_date <= @AsOfDate
              AND detected_patterns != '[]'
            ORDER BY analysis_date DESC
            LIMIT @Days";

        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync<string>(sql, new
        {
            CryptoTickerId = cryptoTickerId,
            AsOfDate = asOfDate,
            Days = days
        });

        var signals = new List<string>();
        foreach (var json in rows)
        {
            try
            {
                var patterns = JsonSerializer.Deserialize<List<PatternDto>>(json);
                if (patterns != null)
                    signals.AddRange(patterns.Select(p => p.Signal ?? "neutral"));
            }
            catch { /* skip malformed JSON */ }
        }
        return signals;
    }

    public async Task<IEnumerable<DateOnly>> GetAnalyzedDatesAsync(int cryptoTickerId, DateOnly startDate, DateOnly endDate)
    {
        const string sql = @"
            SELECT DISTINCT analysis_date
            FROM analysis_crypto_candlestick_pattern
            WHERE crypto_ticker_id = @CryptoTickerId
              AND analysis_date >= @StartDate
              AND analysis_date <= @EndDate
              AND daily_close IS NOT NULL
            ORDER BY analysis_date ASC";

        using var connection = _connectionFactory.CreateConnection();
        var dates = await connection.QueryAsync<DateTime>(sql, new
        {
            CryptoTickerId = cryptoTickerId,
            StartDate = startDate,
            EndDate = endDate
        });

        return dates.Select(d => DateOnly.FromDateTime(d));
    }

    private class DailyCloseRow
    {
        public DateTime Date { get; set; }
        public decimal Close { get; set; }
        public decimal? Open { get; set; }
    }

    private class IndicatorRow
    {
        public decimal? Ema { get; set; }
        public decimal? Sma { get; set; }
        public decimal? Rsi { get; set; }
    }

    private class PatternDto
    {
        public string? Signal { get; set; }
    }
}
