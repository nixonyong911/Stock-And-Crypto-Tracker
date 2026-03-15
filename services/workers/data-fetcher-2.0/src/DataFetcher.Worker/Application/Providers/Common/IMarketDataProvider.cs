namespace DataFetcher.Worker.Application.Providers.Common;

public interface IMarketDataProvider
{
    string ProviderName { get; }
    ProviderCapabilities Capabilities { get; }

    Task<AssetLookupResult> LookupAssetAsync(string symbol, string assetType, CancellationToken ct = default);
    Task<BarFetchResult> FetchBarsAsync(BarFetchRequest request, CancellationToken ct = default);
    Task<BarFetchResult> FetchBackfillBarsAsync(BackfillBarRequest request, CancellationToken ct = default);
}

public class ProviderCapabilities
{
    public bool Stocks { get; init; }
    public bool Crypto { get; init; }
    public bool Commodities { get; init; }
    public bool Indices { get; init; }
    public bool Etfs { get; init; }
    public bool SupportsBatchFetch { get; init; }

    public bool Supports(string assetType) => assetType.ToLowerInvariant() switch
    {
        "stock" => Stocks,
        "etf" => Etfs,
        "crypto" => Crypto,
        "commodity" => Commodities,
        "index" => Indices,
        _ => false
    };
}

public class AssetLookupResult
{
    public bool Found { get; init; }
    public string Symbol { get; init; } = string.Empty;
    public string? Name { get; init; }
    public string? Exchange { get; init; }
    public int? EtoroInstrumentId { get; init; }
    public string? ProviderName { get; init; }
    public string? Error { get; init; }

    public static AssetLookupResult Success(string symbol, string provider, string? name = null, string? exchange = null, int? etoroInstrumentId = null)
        => new() { Found = true, Symbol = symbol, ProviderName = provider, Name = name, Exchange = exchange, EtoroInstrumentId = etoroInstrumentId };

    public static AssetLookupResult NotFound(string symbol, string provider)
        => new() { Found = false, Symbol = symbol, ProviderName = provider };

    public static AssetLookupResult Failed(string symbol, string provider, string error)
        => new() { Found = false, Symbol = symbol, ProviderName = provider, Error = error };
}

public class BarFetchRequest
{
    public int InstrumentId { get; init; }
    public string Symbol { get; init; } = string.Empty;
    public string AssetType { get; init; } = "stock";
    public int Count { get; init; } = 100;
    public string Interval { get; init; } = "FifteenMinutes";
}

public class BackfillBarRequest
{
    public int InstrumentId { get; init; }
    public string Symbol { get; init; } = string.Empty;
    public string AssetType { get; init; } = "stock";
    public int Count { get; init; } = 180;
    public string Interval { get; init; } = "OneDay";
    public DateTime? Since { get; init; }
}

public class BarFetchResult
{
    public bool Success { get; init; }
    public string ProviderName { get; init; } = string.Empty;
    public List<OhlcvBar> Bars { get; init; } = [];
    public string? Error { get; init; }

    public static BarFetchResult Ok(string provider, List<OhlcvBar> bars)
        => new() { Success = true, ProviderName = provider, Bars = bars };

    public static BarFetchResult Fail(string provider, string error)
        => new() { Success = false, ProviderName = provider, Error = error };
}

public class OhlcvBar
{
    public DateTime Timestamp { get; init; }
    public decimal Open { get; init; }
    public decimal High { get; init; }
    public decimal Low { get; init; }
    public decimal Close { get; init; }
    public decimal Volume { get; init; }
}
