using System.Text.Json;
using Dapper;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public class PriceTargetRepository : IPriceTargetRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<PriceTargetRepository> _logger;

    public PriceTargetRepository(IDbConnectionFactory connectionFactory, ILogger<PriceTargetRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task InsertAsync(PriceTarget target)
    {
        if (string.IsNullOrWhiteSpace(target.MetadataJson) || target.MetadataJson == "{}")
            throw new ArgumentException($"PriceTarget for {target.Symbol} on {target.AnalysisDate} must have populated metadata");

        const string sql = @"
            INSERT INTO analysis_ticker_price_targets (
                ticker_symbol, asset_type, trader_type, analysis_date,
                latest_close, entry_price, entry_price_low, entry_price_high,
                target_price, stop_loss,
                signal_summary, calculation_method, confidence, metadata,
                created_at, updated_at
            ) VALUES (
                @Symbol, @AssetType, @TraderType, @AnalysisDate,
                @LatestClose, @EntryPrice, @EntryPriceLow, @EntryPriceHigh,
                @TargetPrice, @StopLoss,
                @SignalSummary, @CalculationMethod, @Confidence, @MetadataJson::jsonb,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (ticker_symbol, analysis_date, trader_type) DO UPDATE SET
                latest_close = EXCLUDED.latest_close,
                entry_price = EXCLUDED.entry_price,
                entry_price_low = EXCLUDED.entry_price_low,
                entry_price_high = EXCLUDED.entry_price_high,
                target_price = EXCLUDED.target_price,
                stop_loss = EXCLUDED.stop_loss,
                signal_summary = EXCLUDED.signal_summary,
                calculation_method = EXCLUDED.calculation_method,
                confidence = EXCLUDED.confidence,
                metadata = EXCLUDED.metadata,
                updated_at = CURRENT_TIMESTAMP";

        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(sql, new
        {
            target.Symbol,
            target.AssetType,
            target.TraderType,
            AnalysisDate = target.AnalysisDate,
            target.LatestClose,
            target.EntryPrice,
            target.EntryPriceLow,
            target.EntryPriceHigh,
            target.TargetPrice,
            target.StopLoss,
            target.SignalSummary,
            target.CalculationMethod,
            target.Confidence,
            target.MetadataJson
        });

        _logger.LogDebug("Inserted price target for {Symbol}/{TraderType} on {Date}", target.Symbol, target.TraderType, target.AnalysisDate);
    }

    public async Task<IEnumerable<(DateOnly Date, decimal Close)>> GetRecentDailyClosesAsync(int stockTickerId, DateOnly asOfDate, int days)
    {
        const string sql = @"
            SELECT analysis_date AS Date, daily_close AS Close
            FROM analysis_stock_candlestick_pattern
            WHERE stock_ticker_id = @StockTickerId
              AND analysis_date <= @AsOfDate
              AND daily_close IS NOT NULL
            ORDER BY analysis_date DESC
            LIMIT @Days";

        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync<DailyCloseRow>(sql, new
        {
            StockTickerId = stockTickerId,
            AsOfDate = asOfDate,
            Days = days
        });

        return rows.Select(r => (DateOnly.FromDateTime(r.Date), r.Close));
    }

    public async Task<(decimal? Ema20, decimal? Ema50, decimal? Rsi)?> GetLatestIndicatorAsync(int stockTickerId, DateOnly asOfDate)
    {
        const string sql = @"
            SELECT ema AS Ema, sma AS Sma, rsi AS Rsi
            FROM analysis_stock_indicator
            WHERE stock_ticker_id = @StockTickerId
              AND indicator_time <= @AsOfDate::date + interval '1 day'
            ORDER BY indicator_time DESC
            LIMIT 1";

        using var connection = _connectionFactory.CreateConnection();
        var row = await connection.QueryFirstOrDefaultAsync<IndicatorRow>(sql, new
        {
            StockTickerId = stockTickerId,
            AsOfDate = asOfDate
        });

        if (row == null) return null;

        return (row.Ema, row.Sma, row.Rsi);
    }

    public async Task<IEnumerable<string>> GetRecentCandleSignalsAsync(int stockTickerId, DateOnly asOfDate, int days)
    {
        const string sql = @"
            SELECT detected_patterns::text AS PatternsJson
            FROM analysis_stock_candlestick_pattern
            WHERE stock_ticker_id = @StockTickerId
              AND analysis_date <= @AsOfDate
              AND detected_patterns != '[]'
            ORDER BY analysis_date DESC
            LIMIT @Days";

        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync<string>(sql, new
        {
            StockTickerId = stockTickerId,
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
                {
                    signals.AddRange(patterns.Select(p => p.Signal ?? "neutral"));
                }
            }
            catch { /* skip malformed JSON */ }
        }
        return signals;
    }

    public async Task<IEnumerable<DateOnly>> GetComputedDatesAsync(string symbol, DateOnly startDate, DateOnly endDate, string? traderType = null)
    {
        var sql = @"
            SELECT DISTINCT analysis_date
            FROM analysis_ticker_price_targets
            WHERE ticker_symbol = @Symbol
              AND analysis_date >= @StartDate
              AND analysis_date <= @EndDate";

        if (traderType != null)
            sql += " AND trader_type = @TraderType";

        sql += " ORDER BY analysis_date ASC";

        using var connection = _connectionFactory.CreateConnection();
        var dates = await connection.QueryAsync<DateTime>(sql, new
        {
            Symbol = symbol,
            StartDate = startDate,
            EndDate = endDate,
            TraderType = traderType
        });

        return dates.Select(d => DateOnly.FromDateTime(d));
    }

    public async Task<int> DeleteOlderThanAsync(int retentionDays = 90)
    {
        const string sql = @"
            DELETE FROM analysis_ticker_price_targets
            WHERE analysis_date < CURRENT_DATE - @RetentionDays";

        using var connection = _connectionFactory.CreateConnection();
        var deleted = await connection.ExecuteAsync(sql, new { RetentionDays = retentionDays });

        if (deleted > 0)
            _logger.LogInformation("Deleted {Count} price target rows older than {Days} days", deleted, retentionDays);

        return deleted;
    }

    private class DailyCloseRow
    {
        public DateTime Date { get; set; }
        public decimal Close { get; set; }
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
