using System.Data;
using Dapper;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;

namespace DataFetcher.Worker.Workers.Etoro;

/// <summary>
/// Per-run in-memory cache of instrument metadata.
/// Loaded once from DB at the start of each 4h cycle, used for O(1) lookups
/// during all phases, then flushed and cleared at the end.
/// </summary>
internal class EtoroInstrumentMap
{
    private readonly Dictionary<int, InstrumentInfo> _known = new();
    private readonly Dictionary<int, InstrumentInfo> _pending = new();

    internal int KnownCount => _known.Count;
    internal int PendingCount => _pending.Count;

    internal static async Task<EtoroInstrumentMap> LoadAsync(IDbConnection connection)
    {
        var map = new EtoroInstrumentMap();

        var rows = await connection.QueryAsync<LookupRow>(
            "SELECT instrument_id, internal_symbol, display_name FROM lookup_etoro_instruments");

        foreach (var row in rows)
            map._known[row.InstrumentId] = new InstrumentInfo(row.InternalSymbol, row.DisplayName);

        return map;
    }

    internal bool TryGet(int instrumentId, out InstrumentInfo? info)
    {
        if (_known.TryGetValue(instrumentId, out info))
            return true;
        if (_pending.TryGetValue(instrumentId, out info))
            return true;

        info = null;
        return false;
    }

    internal bool Contains(int instrumentId) =>
        _known.ContainsKey(instrumentId) || _pending.ContainsKey(instrumentId);

    internal void AddFromSearch(EtoroSocialInstrument instrument)
    {
        if (string.IsNullOrWhiteSpace(instrument.DisplayName))
            return;

        var info = new InstrumentInfo(instrument.InternalSymbol, instrument.DisplayName);

        if (_known.ContainsKey(instrument.InstrumentId))
        {
            _known[instrument.InstrumentId] = info;
            _pending[instrument.InstrumentId] = info;
        }
        else
        {
            _pending[instrument.InstrumentId] = info;
        }
    }

    internal void AddEnriched(int instrumentId, string displayName, string? internalSymbol)
    {
        if (string.IsNullOrWhiteSpace(displayName))
            return;

        var info = new InstrumentInfo(internalSymbol, displayName);
        _pending[instrumentId] = info;
    }

    internal HashSet<int> FindUnknownIds(
        List<EtoroSocialDataWorker.AggregatedPosition> positions,
        HashSet<int> curatedIds)
    {
        var unknowns = new HashSet<int>();

        foreach (var pos in positions)
        {
            if (!Contains(pos.InstrumentId))
                unknowns.Add(pos.InstrumentId);
        }

        foreach (var id in curatedIds)
        {
            if (!Contains(id))
                unknowns.Add(id);
        }

        return unknowns;
    }

    internal async Task<int> FlushAsync(IDbConnection connection)
    {
        if (_pending.Count == 0)
            return 0;

        const string upsertSql = @"
            INSERT INTO lookup_etoro_instruments (instrument_id, internal_symbol, display_name, first_seen_at, updated_at)
            VALUES (@InstrumentId, @InternalSymbol, @DisplayName, NOW(), NOW())
            ON CONFLICT (instrument_id) DO UPDATE SET
                internal_symbol = COALESCE(EXCLUDED.internal_symbol, lookup_etoro_instruments.internal_symbol),
                display_name = EXCLUDED.display_name,
                updated_at = NOW()";

        var count = 0;
        foreach (var kv in _pending)
        {
            try
            {
                await connection.ExecuteAsync(upsertSql, new
                {
                    InstrumentId = kv.Key,
                    InternalSymbol = kv.Value.InternalSymbol,
                    DisplayName = kv.Value.DisplayName
                });
                count++;
            }
            catch (Exception)
            {
                // Individual insert failure shouldn't abort the batch
            }
        }

        return count;
    }

    internal void Clear()
    {
        _known.Clear();
        _pending.Clear();
    }

    internal record InstrumentInfo(string? InternalSymbol, string DisplayName);

    private class LookupRow
    {
        public int InstrumentId { get; init; }
        public string? InternalSymbol { get; init; }
        public string DisplayName { get; init; } = string.Empty;
    }
}
