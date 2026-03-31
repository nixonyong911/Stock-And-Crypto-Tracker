using System.Collections.Concurrent;
using System.Data;
using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Infrastructure.Common;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace DataFetcher.Worker.Workers.Etoro;

/// <summary>
/// Unified singleton service for eToro instrument metadata.
/// Owns the in-memory cache, DB persistence, and on-demand API resolution.
/// Replaces the per-run EtoroInstrumentMap with a persistent cache that
/// survives across 4h worker cycles.
/// </summary>
public class EtoroInstrumentService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EtoroInstrumentService> _logger;
    private readonly ConcurrentDictionary<int, InstrumentInfo> _cache = new();
    private readonly Dictionary<int, InstrumentInfo> _pending = new();
    private readonly object _pendingLock = new();
    private volatile bool _loaded;

    internal const int MetadataBatchSize = 100;
    internal const int MaxEnrichmentPerRun = 50;

    public EtoroInstrumentService(
        IServiceScopeFactory scopeFactory,
        ILogger<EtoroInstrumentService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public int CacheCount => _cache.Count;
    public int PendingCount { get { lock (_pendingLock) return _pending.Count; } }

    #region Zero I/O (cache-only operations)

    public bool TryGet(int instrumentId, out InstrumentInfo? info)
        => _cache.TryGetValue(instrumentId, out info);

    public bool Contains(int instrumentId)
        => _cache.ContainsKey(instrumentId);

    public IReadOnlyDictionary<int, InstrumentInfo> GetSnapshot()
        => new Dictionary<int, InstrumentInfo>(_cache);

    public (Dictionary<int, InstrumentInfo> Known, HashSet<int> UnknownIds) PartitionByKnown(
        IEnumerable<int> instrumentIds)
    {
        var known = new Dictionary<int, InstrumentInfo>();
        var unknown = new HashSet<int>();

        foreach (var id in instrumentIds)
        {
            if (_cache.TryGetValue(id, out var info))
                known[id] = info;
            else
                unknown.Add(id);
        }

        return (known, unknown);
    }

    public void TrackFromSearch(EtoroSocialInstrument instrument)
    {
        if (string.IsNullOrWhiteSpace(instrument.DisplayName))
            return;

        var info = new InstrumentInfo(
            instrument.DisplayName,
            instrument.Symbol,
            instrument.InstrumentTypeId);

        _cache[instrument.InstrumentId] = info;
        lock (_pendingLock)
            _pending[instrument.InstrumentId] = info;
    }

    public void TrackEnriched(int instrumentId, InstrumentInfo info)
    {
        if (string.IsNullOrWhiteSpace(info.DisplayName))
            return;

        _cache[instrumentId] = info;
        lock (_pendingLock)
            _pending[instrumentId] = info;
    }

    public HashSet<int> FindUnknownIds(
        List<EtoroSocialDataWorker.AggregatedPosition> positions,
        HashSet<int> curatedIds)
    {
        var unknowns = new HashSet<int>();

        foreach (var pos in positions)
        {
            if (!_cache.ContainsKey(pos.InstrumentId))
                unknowns.Add(pos.InstrumentId);
        }

        foreach (var id in curatedIds)
        {
            if (!_cache.ContainsKey(id))
                unknowns.Add(id);
        }

        return unknowns;
    }

    public void ClearPending()
    {
        lock (_pendingLock)
            _pending.Clear();
    }

    #endregion

    #region Worker hot-path (caller provides connection)

    public async Task LoadAsync(IDbConnection connection)
    {
        if (_loaded && _cache.Count > 0)
            return;

        var rows = await connection.QueryAsync<LookupRow>(
            @"SELECT instrument_id AS InstrumentId,
                     display_name AS DisplayName,
                     symbol AS Symbol,
                     instrument_type_id AS InstrumentTypeId
              FROM lookup_etoro_instruments");

        foreach (var row in rows)
        {
            _cache[row.InstrumentId] = new InstrumentInfo(
                row.DisplayName, row.Symbol, row.InstrumentTypeId);
        }

        _loaded = true;
        _logger.LogInformation("Loaded instrument cache: {Count} instruments", _cache.Count);
    }

    public async Task<int> FlushPendingAsync(IDbConnection connection)
    {
        Dictionary<int, InstrumentInfo> snapshot;
        lock (_pendingLock)
        {
            if (_pending.Count == 0)
                return 0;
            snapshot = new Dictionary<int, InstrumentInfo>(_pending);
            _pending.Clear();
        }

        var sb = new StringBuilder();
        var parameters = new DynamicParameters();
        var idx = 0;

        foreach (var kv in snapshot)
        {
            if (idx > 0) sb.Append(", ");
            sb.Append($"(@id{idx}, @sym{idx}, @dn{idx}, @tid{idx}, NOW(), NOW())");
            parameters.Add($"id{idx}", kv.Key);
            parameters.Add($"sym{idx}", kv.Value.Symbol);
            parameters.Add($"dn{idx}", kv.Value.DisplayName);
            parameters.Add($"tid{idx}", kv.Value.InstrumentTypeId);
            idx++;
        }

        var sql = $@"
            INSERT INTO lookup_etoro_instruments
                (instrument_id, symbol, display_name, instrument_type_id, first_seen_at, updated_at)
            VALUES {sb}
            ON CONFLICT (instrument_id) DO UPDATE SET
                symbol = COALESCE(EXCLUDED.symbol, lookup_etoro_instruments.symbol),
                display_name = EXCLUDED.display_name,
                instrument_type_id = COALESCE(EXCLUDED.instrument_type_id, lookup_etoro_instruments.instrument_type_id),
                updated_at = NOW()";

        try
        {
            await connection.ExecuteAsync(sql, parameters);
            _logger.LogDebug("Flushed {Count} pending instrument entries", snapshot.Count);
            return snapshot.Count;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to flush {Count} pending instrument entries", snapshot.Count);
            return 0;
        }
    }

    #endregion

    #region Scoped operations (creates internal scope for DB/API)

    public async Task<InstrumentInfo?> ResolveAsync(int instrumentId, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(instrumentId, out var cached))
            return cached;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        using var connection = db.CreateConnection();

        var row = await connection.QueryFirstOrDefaultAsync<LookupRow>(
            @"SELECT instrument_id AS InstrumentId,
                     display_name AS DisplayName,
                     symbol AS Symbol,
                     instrument_type_id AS InstrumentTypeId
              FROM lookup_etoro_instruments
              WHERE instrument_id = @Id", new { Id = instrumentId });

        if (row != null)
        {
            var dbInfo = new InstrumentInfo(row.DisplayName, row.Symbol, row.InstrumentTypeId);
            _cache[instrumentId] = dbInfo;
            return dbInfo;
        }

        var client = scope.ServiceProvider.GetRequiredService<IEtoroMarketDataClient>();
        var result = await client.LookupInstrumentByIdAsync(instrumentId, ct);

        if (result?.DisplayName == null)
            return null;

        var apiInfo = new InstrumentInfo(
            result.DisplayName, result.Symbol, result.InstrumentTypeId);

        _cache[instrumentId] = apiInfo;

        try
        {
            await connection.ExecuteAsync(
                @"INSERT INTO lookup_etoro_instruments
                    (instrument_id, symbol, display_name, instrument_type_id, first_seen_at, updated_at)
                  VALUES (@Id, @Symbol, @DisplayName, @TypeId, NOW(), NOW())
                  ON CONFLICT (instrument_id) DO UPDATE SET
                    symbol = COALESCE(EXCLUDED.symbol, lookup_etoro_instruments.symbol),
                    display_name = EXCLUDED.display_name,
                    instrument_type_id = COALESCE(EXCLUDED.instrument_type_id, lookup_etoro_instruments.instrument_type_id),
                    updated_at = NOW()",
                new { Id = instrumentId, apiInfo.Symbol, apiInfo.DisplayName, TypeId = apiInfo.InstrumentTypeId });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist resolved instrument {Id} to DB", instrumentId);
        }

        return apiInfo;
    }

    public async Task<Dictionary<int, InstrumentInfo>> ResolveBatchAsync(
        IEnumerable<int> instrumentIds, CancellationToken ct = default)
    {
        var result = new Dictionary<int, InstrumentInfo>();
        var toResolve = new List<int>();

        foreach (var id in instrumentIds)
        {
            if (_cache.TryGetValue(id, out var cached))
                result[id] = cached;
            else
                toResolve.Add(id);
        }

        if (toResolve.Count == 0)
            return result;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        using var connection = db.CreateConnection();

        var dbRows = await connection.QueryAsync<LookupRow>(
            @"SELECT instrument_id AS InstrumentId,
                     display_name AS DisplayName,
                     symbol AS Symbol,
                     instrument_type_id AS InstrumentTypeId
              FROM lookup_etoro_instruments
              WHERE instrument_id = ANY(@Ids)",
            new { Ids = toResolve.ToArray() });

        var remaining = new HashSet<int>(toResolve);
        foreach (var row in dbRows)
        {
            var info = new InstrumentInfo(row.DisplayName, row.Symbol, row.InstrumentTypeId);
            _cache[row.InstrumentId] = info;
            result[row.InstrumentId] = info;
            remaining.Remove(row.InstrumentId);
        }

        if (remaining.Count == 0)
            return result;

        var client = scope.ServiceProvider.GetRequiredService<IEtoroMarketDataClient>();

        try
        {
            var metadata = await client.GetInstrumentsMetadataAsync(remaining, ct);
            foreach (var meta in metadata)
            {
                if (meta.DisplayName == null) continue;

                var info = new InstrumentInfo(meta.DisplayName, meta.SymbolFull, meta.InstrumentTypeId);
                _cache[meta.InstrumentId] = info;
                result[meta.InstrumentId] = info;
                remaining.Remove(meta.InstrumentId);

                lock (_pendingLock)
                    _pending[meta.InstrumentId] = info;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bulk metadata call failed for {Count} instruments, falling back to individual lookups",
                remaining.Count);
        }

        var fallbackIds = remaining.Take(MaxEnrichmentPerRun).ToList();
        foreach (var id in fallbackIds)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var lookup = await client.LookupInstrumentByIdAsync(id, ct);
                if (lookup?.DisplayName == null) continue;

                var info = new InstrumentInfo(
                    lookup.DisplayName, lookup.Symbol, lookup.InstrumentTypeId);
                _cache[id] = info;
                result[id] = info;

                lock (_pendingLock)
                    _pending[id] = info;

                await Task.Delay(TimeSpan.FromMilliseconds(1200), ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to resolve instrument {Id} via individual lookup", id);
            }
        }

        _logger.LogInformation("ResolveBatch: {Requested} requested, {Resolved} resolved ({CacheHits} cache, {DbHits} DB, {ApiHits} API)",
            instrumentIds.Count(), result.Count,
            instrumentIds.Count() - toResolve.Count,
            toResolve.Count - remaining.Count - fallbackIds.Count(id => result.ContainsKey(id)),
            result.Count - (instrumentIds.Count() - toResolve.Count) - (toResolve.Count - remaining.Count));

        return result;
    }

    public async Task<int> BackfillMissingAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        using var connection = db.CreateConnection();
        var client = scope.ServiceProvider.GetRequiredService<IEtoroMarketDataClient>();

        var missingIds = (await connection.QueryAsync<int>(
            @"SELECT instrument_id FROM lookup_etoro_instruments
              WHERE symbol IS NULL OR instrument_type_id IS NULL")).ToList();

        if (missingIds.Count == 0)
        {
            _logger.LogInformation("Backfill: all instruments already have complete data");
            return 0;
        }

        _logger.LogInformation("Backfill: {Count} instruments with missing data", missingIds.Count);
        var filled = 0;

        for (var batch = 0; batch < missingIds.Count; batch += MetadataBatchSize)
        {
            ct.ThrowIfCancellationRequested();
            var chunk = missingIds.Skip(batch).Take(MetadataBatchSize).ToList();

            try
            {
                var metadata = await client.GetInstrumentsMetadataAsync(chunk, ct);
                foreach (var meta in metadata)
                {
                    if (meta.DisplayName == null) continue;

                    await connection.ExecuteAsync(
                        @"UPDATE lookup_etoro_instruments SET
                            symbol = COALESCE(@Symbol, symbol),
                            instrument_type_id = COALESCE(@TypeId, instrument_type_id),
                            display_name = COALESCE(@DisplayName, display_name),
                            updated_at = NOW()
                          WHERE instrument_id = @Id",
                        new { Id = meta.InstrumentId, Symbol = meta.SymbolFull, TypeId = meta.InstrumentTypeId,
                              DisplayName = meta.DisplayName });

                    var info = new InstrumentInfo(meta.DisplayName, meta.SymbolFull, meta.InstrumentTypeId);
                    _cache[meta.InstrumentId] = info;
                    filled++;
                }

                await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Backfill batch starting at {Offset} failed", batch);
            }
        }

        _logger.LogInformation("Backfill complete: {Filled} instruments updated", filled);
        return filled;
    }

    #endregion

    public record InstrumentInfo(string DisplayName, string? Symbol, int? InstrumentTypeId);

    private class LookupRow
    {
        public int InstrumentId { get; init; }
        public string DisplayName { get; init; } = string.Empty;
        public string? Symbol { get; init; }
        public int? InstrumentTypeId { get; init; }
    }
}
