using System.Collections.Concurrent;
using Dapper;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public class PriceTargetParametersRepository : IPriceTargetParametersRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<PriceTargetParametersRepository> _logger;

    private static readonly ConcurrentDictionary<string, (IReadOnlyList<PriceTargetParameters> Data, DateTime LoadedAt)> _cache = new();
    private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(6);

    public PriceTargetParametersRepository(IDbConnectionFactory connectionFactory, ILogger<PriceTargetParametersRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<PriceTargetParameters?> GetParametersAsync(string assetType, string traderType)
    {
        var all = await GetAllActiveParametersAsync(assetType);
        return all.FirstOrDefault(p => p.TraderType == traderType);
    }

    public async Task<IReadOnlyList<PriceTargetParameters>> GetAllActiveParametersAsync(string assetType)
    {
        var cacheKey = assetType;
        if (_cache.TryGetValue(cacheKey, out var cached) && DateTime.UtcNow - cached.LoadedAt < CacheTtl)
        {
            return cached.Data;
        }

        const string sql = @"
            SELECT
                asset_type   AS AssetType,
                trader_type  AS TraderType,
                lookback_days AS LookbackDays,
                stop_loss_pct AS StopLossPct,
                overbought_rsi AS OverboughtRsi,
                oversold_rsi   AS OversoldRsi,
                overbought_discount AS OverboughtDiscount,
                oversold_bounce     AS OversoldBounce,
                trend_weight     AS TrendWeight,
                momentum_weight  AS MomentumWeight,
                pattern_weight   AS PatternWeight,
                bullish_threshold AS BullishThreshold,
                bearish_threshold AS BearishThreshold,
                entry_range_pct   AS EntryRangePct,
                is_active AS IsActive
            FROM price_target_parameters
            WHERE asset_type = @AssetType
              AND is_active = true
            ORDER BY trader_type";

        try
        {
            using var connection = _connectionFactory.CreateConnection();
            var rows = await connection.QueryAsync<PriceTargetParameters>(sql, new { AssetType = assetType });
            var result = rows.ToList().AsReadOnly();

            _cache[cacheKey] = (result, DateTime.UtcNow);
            _logger.LogDebug("Loaded {Count} price target parameters for {AssetType}", result.Count, assetType);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load price target parameters for {AssetType}", assetType);

            if (_cache.TryGetValue(cacheKey, out var stale))
            {
                _logger.LogWarning("Returning stale cached parameters for {AssetType}", assetType);
                return stale.Data;
            }

            throw;
        }
    }
}
