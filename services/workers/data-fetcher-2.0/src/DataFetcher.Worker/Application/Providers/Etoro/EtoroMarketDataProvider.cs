using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Application.Providers.Etoro;

public class EtoroMarketDataProvider : DataProviderBase, IMarketDataProvider
{
    private readonly IEtoroMarketDataClient _apiClient;
    private readonly EtoroSettings _settings;
    private readonly ILogger<EtoroMarketDataProvider> _logger;

    public override string ProviderName => "eToro";

    public override ProviderCapabilities Capabilities => new()
    {
        Stocks = true,
        Crypto = true,
        Etfs = true,
        Commodities = true,
        Indices = true,
        SupportsBatchFetch = false
    };

    public override ResilienceConfig GetResilienceConfig() => new(
        MaxRetries: 2,
        InitialRetryDelay: TimeSpan.FromSeconds(3),
        RequestTimeout: TimeSpan.FromSeconds(45),
        CircuitBreakerThreshold: 3,
        CircuitBreakerDuration: TimeSpan.FromMinutes(2)
    );

    public override async Task<HealthCheckResult> HealthCheckAsync(CancellationToken ct)
    {
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var results = await _apiClient.SearchInstrumentAsync("AAPL", "internalSymbolFull", ct);
            return new HealthCheckResult(results.Count > 0, Latency: sw.Elapsed);
        }
        catch (Exception ex)
        {
            return new HealthCheckResult(false, ex.Message);
        }
    }

    private static readonly Dictionary<string, HashSet<string>> AssetClassMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["stock"] = new(StringComparer.OrdinalIgnoreCase) { "Stocks" },
        ["etf"] = new(StringComparer.OrdinalIgnoreCase) { "ETF" },
        ["crypto"] = new(StringComparer.OrdinalIgnoreCase) { "Crypto" },
        ["commodity"] = new(StringComparer.OrdinalIgnoreCase) { "Commodities" },
        ["index"] = new(StringComparer.OrdinalIgnoreCase) { "Indices" },
    };

    public EtoroMarketDataProvider(
        IEtoroMarketDataClient apiClient,
        IOptions<EtoroSettings> settings,
        ILogger<EtoroMarketDataProvider> logger)
    {
        _apiClient = apiClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<AssetLookupResult> LookupAssetAsync(string symbol, string assetType, CancellationToken ct = default)
    {
        try
        {
            var searchSymbol = assetType.Equals("crypto", StringComparison.OrdinalIgnoreCase)
                ? symbol.Split('/')[0]
                : symbol;

            var results = await _apiClient.SearchInstrumentAsync(searchSymbol, "internalSymbolFull", ct);

            if (results.Count == 0)
            {
                results = await _apiClient.SearchInstrumentAsync(searchSymbol, "symbolFull", ct);
            }

            if (!AssetClassMap.TryGetValue(assetType, out var validClasses))
            {
                return AssetLookupResult.NotFound(symbol, ProviderName);
            }

            var match = results.FirstOrDefault(r => validClasses.Contains(r.InternalAssetClassName));

            if (match == null)
            {
                _logger.LogInformation("eToro: {Symbol} ({AssetType}) not found. Got {Count} results: {Classes}",
                    symbol, assetType, results.Count,
                    string.Join(", ", results.Select(r => $"{r.InternalSymbolFull}={r.InternalAssetClassName}")));
                return AssetLookupResult.NotFound(symbol, ProviderName);
            }

            _logger.LogInformation("eToro: {Symbol} resolved to instrumentId={InstrumentId} ({DisplayName}, {Class})",
                symbol, match.InstrumentId, match.InstrumentDisplayName, match.InternalAssetClassName);

            return AssetLookupResult.Success(
                symbol, ProviderName,
                match.InstrumentDisplayName, null,
                match.InstrumentId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error looking up {Symbol} on eToro", symbol);
            return AssetLookupResult.Failed(symbol, ProviderName, ex.Message);
        }
    }

    public async Task<BarFetchResult> FetchBarsAsync(BarFetchRequest request, CancellationToken ct = default)
    {
        try
        {
            if (request.InstrumentId <= 0)
                return BarFetchResult.Fail(ProviderName, "No eToro instrumentId available");

            var candles = await _apiClient.GetCandlesAsync(
                request.InstrumentId,
                _settings.DefaultCandleInterval,
                "desc",
                request.Count,
                ct);

            var bars = MapCandles(candles);
            return BarFetchResult.Ok(ProviderName, bars);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching bars for instrument {InstrumentId} from eToro", request.InstrumentId);
            return BarFetchResult.Fail(ProviderName, ex.Message);
        }
    }

    public async Task<BarFetchResult> FetchBackfillBarsAsync(BackfillBarRequest request, CancellationToken ct = default)
    {
        try
        {
            if (request.InstrumentId <= 0)
                return BarFetchResult.Fail(ProviderName, "No eToro instrumentId available");

            var candles = await _apiClient.GetCandlesAsync(
                request.InstrumentId,
                _settings.BackfillCandleInterval,
                "desc",
                request.Count > 0 ? request.Count : 180,
                ct);

            var bars = MapCandles(candles);
            _logger.LogInformation("eToro backfill: {Count} daily bars for instrument {InstrumentId}",
                bars.Count, request.InstrumentId);

            return BarFetchResult.Ok(ProviderName, bars);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during eToro backfill for instrument {InstrumentId}", request.InstrumentId);
            return BarFetchResult.Fail(ProviderName, ex.Message);
        }
    }

    private static List<OhlcvBar> MapCandles(List<EtoroCandle> candles) =>
        candles.Select(c => new OhlcvBar
        {
            Timestamp = DateTime.SpecifyKind(c.FromDate, DateTimeKind.Utc),
            Open = (decimal)c.Open,
            High = (decimal)c.High,
            Low = (decimal)c.Low,
            Close = (decimal)c.Close,
            Volume = (decimal)(c.Volume ?? 0)
        }).ToList();
}
