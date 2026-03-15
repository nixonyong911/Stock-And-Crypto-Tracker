namespace DataFetcher.Worker.Application.Providers.Common;

public interface IMarketDataResolver
{
    Task<ResolveResult> VerifyAndResolveAsync(string symbol, string assetType, CancellationToken ct = default);
}

public class ResolveResult
{
    public bool Found { get; init; }
    public string Symbol { get; init; } = string.Empty;
    public string? Name { get; init; }
    public string? Exchange { get; init; }
    public string? PrimaryProvider { get; init; }
    public int? EtoroInstrumentId { get; init; }
    public int? PreferredDataSourceId { get; init; }
    public string? Error { get; init; }

    public static ResolveResult Success(
        string symbol, string provider, int dataSourceId,
        string? name = null, string? exchange = null, int? etoroInstrumentId = null)
        => new()
        {
            Found = true, Symbol = symbol, PrimaryProvider = provider,
            PreferredDataSourceId = dataSourceId, Name = name,
            Exchange = exchange, EtoroInstrumentId = etoroInstrumentId
        };

    public static ResolveResult NotFound(string symbol)
        => new() { Found = false, Symbol = symbol };

    public static ResolveResult Failed(string symbol, string error)
        => new() { Found = false, Symbol = symbol, Error = error };
}
