using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Etoro;

/// <summary>
/// Collects crowd behavior data from eToro every 4 hours:
/// - Top instruments by holdingPct (instrument discovery)
/// - Curated lists (Trending on News, Analysts' Top Picks)
/// - Top 100 investor portfolios (aggregated by instrument)
/// Pure data lake: no auto-actions, no alerts, no frontend integration.
/// </summary>
public class EtoroSocialDataWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly EtoroSettings _settings;
    private readonly ILogger<EtoroSocialDataWorker> _logger;
    private readonly IMetricsClient _metrics;

    internal const int IntervalHours = 4;
    internal const int TotalPages = 8;
    internal const int PageSize = 25;
    internal const int TopInvestorCount = 100;
    internal const int RetentionDays = 90;
    internal const int MaxConsecutivePortfolioFailures = 10;

    internal static readonly TimeSpan ApiCallDelay = TimeSpan.FromMilliseconds(200);
    internal static readonly TimeSpan PortfolioCallDelay = TimeSpan.FromMilliseconds(1200);

    public EtoroSocialDataWorker(
        IServiceProvider serviceProvider,
        IOptions<EtoroSettings> settings,
        ILogger<EtoroSocialDataWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("eToro Social Data Worker starting ({IntervalHours}h interval)", IntervalHours);
        await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var startedAt = DateTime.UtcNow;
            var status = "success";
            string? message = null;

            try
            {
                var stats = await CollectSocialDataAsync(stoppingToken);
                message = $"Social data: {stats.InstrumentRows} instruments, {stats.InvestorRows} investor positions, {stats.CuratedRows} curated items, {stats.LookupUpserts} lookup upserts";
                _logger.LogInformation("{Message}", message);

                if (stats.InstrumentRows == 0 && stats.InvestorRows == 0 && stats.CuratedRows == 0)
                    status = "empty";

                await _metrics.IncrementCounterAsync("etoro_social_fetch_total", 1,
                    new Dictionary<string, string> { ["status"] = status });
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                status = "failed";
                message = ex.Message;
                _logger.LogError(ex, "Error during eToro social data collection");

                await _metrics.IncrementCounterAsync("etoro_social_fetch_total", 1,
                    new Dictionary<string, string> { ["status"] = "error" });
            }

            try
            {
                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var schedule = await scheduleRepo.GetScheduleByNameAsync("eToro Social Data");
                if (schedule != null)
                {
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message,
                        (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update schedule tracking for eToro Social Data");
            }

            await Task.Delay(TimeSpan.FromHours(IntervalHours), stoppingToken);
        }

        _logger.LogInformation("eToro Social Data Worker stopped");
    }

    internal async Task<FetchStats> CollectSocialDataAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var client = scope.ServiceProvider.GetRequiredService<IEtoroMarketDataClient>();
        var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        using var connection = db.CreateConnection();

        var stats = new FetchStats();
        var fetchedAt = DateTime.UtcNow;

        // Phase A: Instrument discovery
        var allInstruments = await FetchInstrumentsAsync(client, ct);

        // Phase B: Curated lists (isolated -- Phase A failure doesn't block this)
        var (curatedLists, curatedInstrumentIds) = await FetchCuratedListsAsync(client, ct);

        // Phase C+D: Top investors + their portfolios
        var investorPositions = await FetchInvestorPortfoliosAsync(client, ct);

        // Persist to database -- lookup first (FK dependency), then data tables
        _logger.LogInformation("Persisting data to database");

        stats.LookupUpserts = await UpsertLookupInstrumentsAsync(
            connection, allInstruments, curatedInstrumentIds, investorPositions);

        stats.InstrumentRows = await InsertInstrumentDataAsync(connection, allInstruments, fetchedAt);
        stats.CuratedRows = await InsertCuratedListsAsync(connection, curatedLists, fetchedAt);
        stats.InvestorRows = await InsertInvestorPositionsAsync(connection, investorPositions, fetchedAt);

        await PruneOldDataAsync(connection);

        return stats;
    }

    internal async Task<List<EtoroSocialInstrument>> FetchInstrumentsAsync(
        IEtoroMarketDataClient client, CancellationToken ct)
    {
        var allInstruments = new List<EtoroSocialInstrument>();

        try
        {
            _logger.LogInformation("Phase A: Fetching top instruments by holdingPct");

            for (var page = 1; page <= TotalPages; page++)
            {
                ct.ThrowIfCancellationRequested();
                var result = await client.SearchInstrumentsSortedAsync(
                    sortField: "-holdingPct",
                    pageSize: PageSize,
                    pageNumber: page,
                    cancellationToken: ct);

                if (result.Items.Count == 0) break;
                allInstruments.AddRange(result.Items);
                _logger.LogDebug("Fetched page {Page}: {Count} instruments", page, result.Items.Count);
                await Task.Delay(ApiCallDelay, ct);
            }

            _logger.LogInformation("Phase A complete: {Count} instruments discovered", allInstruments.Count);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Phase A failed after {Count} instruments -- continuing with partial data", allInstruments.Count);
        }

        return allInstruments;
    }

    internal async Task<(EtoroCuratedListsResponse?, HashSet<int>)> FetchCuratedListsAsync(
        IEtoroMarketDataClient client, CancellationToken ct)
    {
        var curatedInstrumentIds = new HashSet<int>();
        EtoroCuratedListsResponse? curatedLists = null;

        try
        {
            _logger.LogInformation("Phase B: Fetching curated lists");
            curatedLists = await client.GetCuratedListsAsync(ct);
            await Task.Delay(ApiCallDelay, ct);

            if (curatedLists?.CuratedLists != null)
            {
                foreach (var list in curatedLists.CuratedLists)
                    foreach (var item in list.Items)
                        curatedInstrumentIds.Add(item.InstrumentId);
            }

            _logger.LogInformation("Phase B complete: {ListCount} curated lists, {InstrumentCount} unique instruments",
                curatedLists?.CuratedLists.Count ?? 0, curatedInstrumentIds.Count);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Phase B failed -- continuing without curated lists");
        }

        return (curatedLists, curatedInstrumentIds);
    }

    internal async Task<List<AggregatedPosition>> FetchInvestorPortfoliosAsync(
        IEtoroMarketDataClient client, CancellationToken ct)
    {
        var investorPositions = new List<AggregatedPosition>();

        try
        {
            _logger.LogInformation("Phase C: Searching top {Count} investors by copiers", TopInvestorCount);
            var investorResult = await client.SearchTopInvestorsAsync(
                period: "CurrYear",
                sort: "-copiers",
                pageSize: TopInvestorCount,
                cancellationToken: ct);
            await Task.Delay(ApiCallDelay, ct);

            _logger.LogInformation("Phase C complete: {Count} investors found", investorResult.Items.Count);

            if (investorResult.Items.Count == 0)
                return investorPositions;

            _logger.LogInformation("Phase D: Fetching portfolios for {Count} investors", investorResult.Items.Count);
            var consecutiveFailures = 0;

            for (var i = 0; i < investorResult.Items.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                var investor = investorResult.Items[i];

                try
                {
                    var portfolio = await client.GetUserPortfolioAsync(investor.UserName, ct);
                    if (portfolio?.Positions != null && portfolio.Positions.Count > 0)
                    {
                        var aggregated = AggregatePositions(investor, portfolio.Positions);
                        investorPositions.AddRange(aggregated);
                    }
                    consecutiveFailures = 0;
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    consecutiveFailures++;
                    _logger.LogWarning(ex, "Failed to fetch portfolio for {Username} ({Consecutive} consecutive failures)",
                        investor.UserName, consecutiveFailures);

                    if (consecutiveFailures >= MaxConsecutivePortfolioFailures)
                    {
                        _logger.LogError("Aborting Phase D: {Max} consecutive portfolio failures -- possible auth or rate limit issue",
                            MaxConsecutivePortfolioFailures);
                        break;
                    }
                }

                if (i < investorResult.Items.Count - 1)
                    await Task.Delay(PortfolioCallDelay, ct);

                if ((i + 1) % 20 == 0)
                    _logger.LogDebug("Portfolio progress: {Done}/{Total}", i + 1, investorResult.Items.Count);
            }

            _logger.LogInformation("Phase D complete: {Count} aggregated investor-instrument positions", investorPositions.Count);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Phase C/D failed -- continuing with {Count} positions collected so far", investorPositions.Count);
        }

        return investorPositions;
    }

    internal static List<AggregatedPosition> AggregatePositions(
        EtoroInvestor investor, List<EtoroPosition> positions)
    {
        return positions
            .GroupBy(p => new { p.InstrumentId, p.IsBuy })
            .Select(g => new AggregatedPosition
            {
                Username = investor.UserName,
                Copiers = investor.Copiers,
                Gain = investor.Gain,
                WinRatio = investor.WinRatio,
                RiskScore = investor.RiskScore,
                InstrumentId = g.Key.InstrumentId,
                IsBuy = g.Key.IsBuy,
                NumPositions = g.Count(),
                TotalInvestmentPct = g.Sum(p => p.InvestmentPct),
                AvgNetProfit = g.Average(p => p.NetProfit)
            })
            .ToList();
    }

    internal async Task<int> UpsertLookupInstrumentsAsync(
        System.Data.IDbConnection connection,
        List<EtoroSocialInstrument> instruments,
        HashSet<int> curatedInstrumentIds,
        List<AggregatedPosition> investorPositions)
    {
        var allIds = new Dictionary<int, (string? Symbol, string? DisplayName, int? TypeId, string? TypeName)>();

        foreach (var inst in instruments)
        {
            allIds[inst.InstrumentId] = (inst.Symbol, inst.DisplayName, inst.InstrumentTypeId, inst.InstrumentType);
        }

        foreach (var id in curatedInstrumentIds)
        {
            allIds.TryAdd(id, (null, null, null, null));
        }

        foreach (var pos in investorPositions)
        {
            allIds.TryAdd(pos.InstrumentId, (null, null, null, null));
        }

        if (allIds.Count == 0) return 0;

        var count = 0;
        const string upsertSql = @"
            INSERT INTO lookup_etoro_instruments (instrument_id, symbol, display_name, instrument_type_id, instrument_type, updated_at)
            VALUES (@InstrumentId, @Symbol, @DisplayName, @TypeId, @TypeName, NOW())
            ON CONFLICT (instrument_id) DO UPDATE SET
                symbol = COALESCE(EXCLUDED.symbol, lookup_etoro_instruments.symbol),
                display_name = COALESCE(EXCLUDED.display_name, lookup_etoro_instruments.display_name),
                instrument_type_id = COALESCE(EXCLUDED.instrument_type_id, lookup_etoro_instruments.instrument_type_id),
                instrument_type = COALESCE(EXCLUDED.instrument_type, lookup_etoro_instruments.instrument_type),
                updated_at = NOW()";

        foreach (var kv in allIds)
        {
            try
            {
                await connection.ExecuteAsync(upsertSql, new
                {
                    InstrumentId = kv.Key,
                    Symbol = kv.Value.Symbol,
                    DisplayName = kv.Value.DisplayName,
                    TypeId = kv.Value.TypeId,
                    TypeName = kv.Value.TypeName
                });
                count++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to upsert lookup instrument {Id}", kv.Key);
            }
        }

        return count;
    }

    internal async Task<int> InsertInstrumentDataAsync(
        System.Data.IDbConnection connection,
        List<EtoroSocialInstrument> instruments,
        DateTime fetchedAt)
    {
        if (instruments.Count == 0) return 0;

        var sb = new StringBuilder();
        var parameters = new DynamicParameters();

        for (var i = 0; i < instruments.Count; i++)
        {
            if (i > 0) sb.Append(", ");
            sb.Append($"(@iid{i}, @hp{i}, @bhp{i}, @shp{i}, @bpc{i}, @t7{i}, @t30{i}, @pu{i}, @dp{i}, @wp{i}, @mp{i}, @cr{i}, @fa{i})");
            parameters.Add($"iid{i}", instruments[i].InstrumentId);
            parameters.Add($"hp{i}", instruments[i].HoldingPct);
            parameters.Add($"bhp{i}", instruments[i].BuyHoldingPct);
            parameters.Add($"shp{i}", instruments[i].SellHoldingPct);
            parameters.Add($"bpc{i}", instruments[i].BuyPctChange24Hours);
            parameters.Add($"t7{i}", instruments[i].Traders7DayChange);
            parameters.Add($"t30{i}", instruments[i].Traders30DayChange);
            parameters.Add($"pu{i}", instruments[i].PopularityUniques7Day);
            parameters.Add($"dp{i}", instruments[i].DailyPriceChange);
            parameters.Add($"wp{i}", instruments[i].WeeklyPriceChange);
            parameters.Add($"mp{i}", instruments[i].MonthlyPriceChange);
            parameters.Add($"cr{i}", instruments[i].CurrentRate);
            parameters.Add($"fa{i}", fetchedAt);
        }

        var sql = $@"
            INSERT INTO unfiltered_etoro_social_instrument_data
                (instrument_id, holding_pct, buy_holding_pct, sell_holding_pct, buy_pct_change_24h,
                 traders_7day_change, traders_30day_change, popularity_uniques_7day,
                 daily_price_change, weekly_price_change, monthly_price_change, current_rate, fetched_at)
            VALUES {sb}
            ON CONFLICT (instrument_id, fetched_at) DO NOTHING";

        try
        {
            var rows = await connection.ExecuteAsync(sql, parameters);
            _logger.LogDebug("Inserted {Rows}/{Total} instrument social data rows", rows, instruments.Count);
            return rows;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to insert instrument social data ({Count} rows)", instruments.Count);
            return 0;
        }
    }

    internal async Task<int> InsertCuratedListsAsync(
        System.Data.IDbConnection connection,
        EtoroCuratedListsResponse? curatedLists,
        DateTime fetchedAt)
    {
        if (curatedLists?.CuratedLists == null || curatedLists.CuratedLists.Count == 0)
            return 0;

        var sb = new StringBuilder();
        var parameters = new DynamicParameters();
        var idx = 0;

        foreach (var list in curatedLists.CuratedLists)
        {
            foreach (var item in list.Items)
            {
                if (idx > 0) sb.Append(", ");
                sb.Append($"(@ln{idx}, @iid{idx}, @fa{idx})");
                parameters.Add($"ln{idx}", list.Name);
                parameters.Add($"iid{idx}", item.InstrumentId);
                parameters.Add($"fa{idx}", fetchedAt);
                idx++;
            }
        }

        if (idx == 0) return 0;

        var sql = $@"
            INSERT INTO unfiltered_etoro_curated_lists (list_name, instrument_id, fetched_at)
            VALUES {sb}";

        try
        {
            await connection.ExecuteAsync(sql, parameters);
            return idx;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to insert curated list data");
            return 0;
        }
    }

    internal async Task<int> InsertInvestorPositionsAsync(
        System.Data.IDbConnection connection,
        List<AggregatedPosition> positions,
        DateTime fetchedAt)
    {
        if (positions.Count == 0) return 0;

        const int batchSize = 500;
        var total = 0;

        for (var batch = 0; batch < positions.Count; batch += batchSize)
        {
            var chunk = positions.Skip(batch).Take(batchSize).ToList();
            var sb = new StringBuilder();
            var parameters = new DynamicParameters();

            for (var i = 0; i < chunk.Count; i++)
            {
                if (i > 0) sb.Append(", ");
                sb.Append($"(@un{i}, @co{i}, @ga{i}, @wr{i}, @rs{i}, @iid{i}, @ib{i}, @np{i}, @tip{i}, @anp{i}, @fa{i})");
                parameters.Add($"un{i}", chunk[i].Username);
                parameters.Add($"co{i}", chunk[i].Copiers);
                parameters.Add($"ga{i}", chunk[i].Gain);
                parameters.Add($"wr{i}", chunk[i].WinRatio);
                parameters.Add($"rs{i}", chunk[i].RiskScore);
                parameters.Add($"iid{i}", chunk[i].InstrumentId);
                parameters.Add($"ib{i}", chunk[i].IsBuy);
                parameters.Add($"np{i}", chunk[i].NumPositions);
                parameters.Add($"tip{i}", chunk[i].TotalInvestmentPct);
                parameters.Add($"anp{i}", chunk[i].AvgNetProfit);
                parameters.Add($"fa{i}", fetchedAt);
            }

            var sql = $@"
                INSERT INTO unfiltered_etoro_top_investor_positions
                    (username, copiers, gain, win_ratio, risk_score, instrument_id, is_buy,
                     num_positions, total_investment_pct, avg_net_profit, fetched_at)
                VALUES {sb}";

            try
            {
                await connection.ExecuteAsync(sql, parameters);
                total += chunk.Count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to insert investor positions batch starting at {Offset}", batch);
            }
        }

        return total;
    }

    internal async Task PruneOldDataAsync(System.Data.IDbConnection connection)
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddDays(-RetentionDays);

            var deleted = await connection.ExecuteAsync(
                "DELETE FROM unfiltered_etoro_social_instrument_data WHERE fetched_at < @Cutoff",
                new { Cutoff = cutoff });
            if (deleted > 0)
                _logger.LogInformation("Pruned {Count} old instrument social data rows", deleted);

            deleted = await connection.ExecuteAsync(
                "DELETE FROM unfiltered_etoro_top_investor_positions WHERE fetched_at < @Cutoff",
                new { Cutoff = cutoff });
            if (deleted > 0)
                _logger.LogInformation("Pruned {Count} old investor position rows", deleted);

            deleted = await connection.ExecuteAsync(
                "DELETE FROM unfiltered_etoro_curated_lists WHERE fetched_at < @Cutoff",
                new { Cutoff = cutoff });
            if (deleted > 0)
                _logger.LogInformation("Pruned {Count} old curated list rows", deleted);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to prune old social data (non-fatal)");
        }
    }

    internal class FetchStats
    {
        public int InstrumentRows { get; set; }
        public int InvestorRows { get; set; }
        public int CuratedRows { get; set; }
        public int LookupUpserts { get; set; }
    }

    internal class AggregatedPosition
    {
        public string Username { get; set; } = string.Empty;
        public int Copiers { get; set; }
        public double Gain { get; set; }
        public double WinRatio { get; set; }
        public int RiskScore { get; set; }
        public int InstrumentId { get; set; }
        public bool IsBuy { get; set; }
        public int NumPositions { get; set; }
        public double TotalInvestmentPct { get; set; }
        public double AvgNetProfit { get; set; }
    }
}
