using Dapper;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public class StockIndicatorAdvancedRepository : IStockIndicatorAdvancedRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<StockIndicatorAdvancedRepository> _logger;

    public StockIndicatorAdvancedRepository(IDbConnectionFactory connectionFactory, ILogger<StockIndicatorAdvancedRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task BulkUpsertAsync(IEnumerable<StockIndicatorAdvanced> indicators)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_indicators_stock_pro
                (stock_ticker_id, data_source_id, indicator_time,
                 bollinger_upper, bollinger_lower, bollinger_middle, bollinger_bandwidth, atr,
                 stoch_k, stoch_d, adx, obv,
                 fibonacci_levels, pivot_levels,
                 ichimoku_tenkan, ichimoku_kijun, ichimoku_senkou_a, ichimoku_senkou_b, ichimoku_chikou,
                 insider_buy_count, insider_sell_count, insider_net_shares, insider_net_value,
                 insider_mspr, insider_mspr_change,
                 analyst_strong_buy, analyst_buy, analyst_hold, analyst_sell, analyst_strong_sell, analyst_consensus)
            VALUES
                (@StockTickerId, @DataSourceId, @IndicatorTime,
                 @BollingerUpper, @BollingerLower, @BollingerMiddle, @BollingerBandwidth, @Atr,
                 @StochK, @StochD, @Adx, @Obv,
                 @FibonacciLevels::jsonb, @PivotLevels::jsonb,
                 @IchimokuTenkan, @IchimokuKijun, @IchimokuSenkouA, @IchimokuSenkouB, @IchimokuChikou,
                 @InsiderBuyCount, @InsiderSellCount, @InsiderNetShares, @InsiderNetValue,
                 @InsiderMspr, @InsiderMsprChange,
                 @AnalystStrongBuy, @AnalystBuy, @AnalystHold, @AnalystSell, @AnalystStrongSell, @AnalystConsensus)
            ON CONFLICT (stock_ticker_id, data_source_id, indicator_time) DO UPDATE SET
                bollinger_upper = COALESCE(EXCLUDED.bollinger_upper, analysis_indicators_stock_pro.bollinger_upper),
                bollinger_lower = COALESCE(EXCLUDED.bollinger_lower, analysis_indicators_stock_pro.bollinger_lower),
                bollinger_middle = COALESCE(EXCLUDED.bollinger_middle, analysis_indicators_stock_pro.bollinger_middle),
                bollinger_bandwidth = COALESCE(EXCLUDED.bollinger_bandwidth, analysis_indicators_stock_pro.bollinger_bandwidth),
                atr = COALESCE(EXCLUDED.atr, analysis_indicators_stock_pro.atr),
                stoch_k = COALESCE(EXCLUDED.stoch_k, analysis_indicators_stock_pro.stoch_k),
                stoch_d = COALESCE(EXCLUDED.stoch_d, analysis_indicators_stock_pro.stoch_d),
                adx = COALESCE(EXCLUDED.adx, analysis_indicators_stock_pro.adx),
                obv = COALESCE(EXCLUDED.obv, analysis_indicators_stock_pro.obv),
                fibonacci_levels = COALESCE(EXCLUDED.fibonacci_levels, analysis_indicators_stock_pro.fibonacci_levels),
                pivot_levels = COALESCE(EXCLUDED.pivot_levels, analysis_indicators_stock_pro.pivot_levels),
                ichimoku_tenkan = COALESCE(EXCLUDED.ichimoku_tenkan, analysis_indicators_stock_pro.ichimoku_tenkan),
                ichimoku_kijun = COALESCE(EXCLUDED.ichimoku_kijun, analysis_indicators_stock_pro.ichimoku_kijun),
                ichimoku_senkou_a = COALESCE(EXCLUDED.ichimoku_senkou_a, analysis_indicators_stock_pro.ichimoku_senkou_a),
                ichimoku_senkou_b = COALESCE(EXCLUDED.ichimoku_senkou_b, analysis_indicators_stock_pro.ichimoku_senkou_b),
                ichimoku_chikou = COALESCE(EXCLUDED.ichimoku_chikou, analysis_indicators_stock_pro.ichimoku_chikou),
                insider_buy_count = COALESCE(EXCLUDED.insider_buy_count, analysis_indicators_stock_pro.insider_buy_count),
                insider_sell_count = COALESCE(EXCLUDED.insider_sell_count, analysis_indicators_stock_pro.insider_sell_count),
                insider_net_shares = COALESCE(EXCLUDED.insider_net_shares, analysis_indicators_stock_pro.insider_net_shares),
                insider_net_value = COALESCE(EXCLUDED.insider_net_value, analysis_indicators_stock_pro.insider_net_value),
                insider_mspr = COALESCE(EXCLUDED.insider_mspr, analysis_indicators_stock_pro.insider_mspr),
                insider_mspr_change = COALESCE(EXCLUDED.insider_mspr_change, analysis_indicators_stock_pro.insider_mspr_change),
                analyst_strong_buy = COALESCE(EXCLUDED.analyst_strong_buy, analysis_indicators_stock_pro.analyst_strong_buy),
                analyst_buy = COALESCE(EXCLUDED.analyst_buy, analysis_indicators_stock_pro.analyst_buy),
                analyst_hold = COALESCE(EXCLUDED.analyst_hold, analysis_indicators_stock_pro.analyst_hold),
                analyst_sell = COALESCE(EXCLUDED.analyst_sell, analysis_indicators_stock_pro.analyst_sell),
                analyst_strong_sell = COALESCE(EXCLUDED.analyst_strong_sell, analysis_indicators_stock_pro.analyst_strong_sell),
                analyst_consensus = COALESCE(EXCLUDED.analyst_consensus, analysis_indicators_stock_pro.analyst_consensus)";

        await connection.ExecuteAsync(sql, indicators);
        _logger.LogDebug("Bulk upserted {Count} advanced stock indicator records", indicators.Count());
    }

    public async Task DeleteOldRecordsAsync(int stockTickerId, int retentionDays = 90)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "DELETE FROM analysis_indicators_stock_pro WHERE stock_ticker_id = @StockTickerId AND indicator_time < NOW() - make_interval(days => @RetentionDays)";

        var deleted = await connection.ExecuteAsync(sql, new { StockTickerId = stockTickerId, RetentionDays = retentionDays });
        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} old advanced indicator records for stock ticker {TickerId}", deleted, stockTickerId);
        }
    }
}
