using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Configuration.Providers;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaMarketDataProvider : DataProviderBase, IMarketDataProvider
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly IAlpacaAssetVerificationService _verificationService;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaMarketDataProvider> _logger;

    public override string ProviderName => "Alpaca";

    public override ProviderCapabilities Capabilities => new()
    {
        Stocks = true,
        Crypto = true,
        Etfs = true,
        Commodities = false,
        Indices = false,
        SupportsBatchFetch = true
    };

    public override ResilienceConfig GetResilienceConfig() => new(
        MaxRetries: 3,
        InitialRetryDelay: TimeSpan.FromSeconds(2),
        RequestTimeout: TimeSpan.FromSeconds(30),
        CircuitBreakerThreshold: 5,
        CircuitBreakerDuration: TimeSpan.FromMinutes(1)
    );

    public override async Task<HealthCheckResult> HealthCheckAsync(CancellationToken ct)
    {
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var asset = await _apiClient.GetAssetAsync("AAPL", ct);
            return new HealthCheckResult(asset != null, Latency: sw.Elapsed);
        }
        catch (Exception ex)
        {
            return new HealthCheckResult(false, ex.Message);
        }
    }

    public AlpacaMarketDataProvider(
        IAlpacaMarketDataClient apiClient,
        IAlpacaAssetVerificationService verificationService,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaMarketDataProvider> logger)
    {
        _apiClient = apiClient;
        _verificationService = verificationService;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<AssetLookupResult> LookupAssetAsync(string symbol, string assetType, CancellationToken ct = default)
    {
        try
        {
            var verification = await _verificationService.VerifyAsync(symbol, assetType, ct);

            if (!verification.Found)
            {
                return verification.Error != null
                    ? AssetLookupResult.Failed(symbol, ProviderName, verification.Error)
                    : AssetLookupResult.NotFound(symbol, ProviderName);
            }

            var lookupSymbol = assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase)
                ? symbol.Replace("/", "")
                : symbol.ToUpperInvariant();

            var asset = await _apiClient.GetAssetAsync(lookupSymbol, ct);
            if (asset != null && (asset.Status == "inactive" || !asset.Tradable))
            {
                _logger.LogInformation("Alpaca asset {Symbol} exists but is inactive/untradable (status={Status}, tradable={Tradable})",
                    symbol, asset.Status, asset.Tradable);
                return AssetLookupResult.NotFound(symbol, ProviderName);
            }

            return AssetLookupResult.Success(symbol, ProviderName, verification.Name, verification.Exchange);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error looking up {Symbol} on Alpaca", symbol);
            return AssetLookupResult.Failed(symbol, ProviderName, ex.Message);
        }
    }

    public async Task<BarFetchResult> FetchBarsAsync(BarFetchRequest request, CancellationToken ct = default)
    {
        try
        {
            var isCrypto = request.AssetType.Equals("crypto", StringComparison.OrdinalIgnoreCase);
            var start = DateTime.UtcNow.AddMinutes(-45);
            var end = DateTime.UtcNow.AddMinutes(-16);
            var symbols = new[] { request.Symbol };
            var timeframe = isCrypto ? _settings.CryptoTimeframe : _settings.StockTimeframe;

            var response = isCrypto
                ? await _apiClient.GetCryptoBarsAsync(symbols, timeframe, start, end, request.Count, cancellationToken: ct)
                : await _apiClient.GetStockBarsAsync(symbols, timeframe, start, end, request.Count, cancellationToken: ct);

            if (response?.Bars == null || !response.Bars.TryGetValue(request.Symbol, out var bars) || bars.Count == 0)
                return BarFetchResult.Ok(ProviderName, []);

            var ohlcvBars = bars.Select(b => new OhlcvBar
            {
                Timestamp = DateTime.SpecifyKind(b.Timestamp, DateTimeKind.Utc),
                Open = (decimal)b.Open,
                High = (decimal)b.High,
                Low = (decimal)b.Low,
                Close = (decimal)b.Close,
                Volume = (decimal)b.Volume
            }).ToList();

            return BarFetchResult.Ok(ProviderName, ohlcvBars);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching bars for {Symbol} from Alpaca", request.Symbol);
            return BarFetchResult.Fail(ProviderName, ex.Message);
        }
    }

    public async Task<BarFetchResult> FetchBackfillBarsAsync(BackfillBarRequest request, CancellationToken ct = default)
    {
        try
        {
            var isCrypto = request.AssetType.Equals("crypto", StringComparison.OrdinalIgnoreCase);
            var start = request.Since ?? DateTime.UtcNow.AddMonths(-_settings.MonthsToBackfill);
            var symbols = new[] { request.Symbol };
            var timeframe = isCrypto ? _settings.CryptoTimeframe : _settings.StockTimeframe;

            var allBars = new List<OhlcvBar>();
            string? pageToken = null;

            do
            {
                ct.ThrowIfCancellationRequested();

                var response = isCrypto
                    ? await _apiClient.GetCryptoBarsAsync(symbols, timeframe, start, limit: _settings.MaxBarsPerRequest, pageToken: pageToken, cancellationToken: ct)
                    : await _apiClient.GetStockBarsAsync(symbols, timeframe, start, limit: _settings.MaxBarsPerRequest, pageToken: pageToken, cancellationToken: ct);

                if (response?.Bars == null || !response.Bars.TryGetValue(request.Symbol, out var bars) || bars.Count == 0)
                    break;

                allBars.AddRange(bars.Select(b => new OhlcvBar
                {
                    Timestamp = DateTime.SpecifyKind(b.Timestamp, DateTimeKind.Utc),
                    Open = (decimal)b.Open,
                    High = (decimal)b.High,
                    Low = (decimal)b.Low,
                    Close = (decimal)b.Close,
                    Volume = (decimal)b.Volume
                }));

                pageToken = response.NextPageToken;
            } while (!string.IsNullOrEmpty(pageToken));

            return BarFetchResult.Ok(ProviderName, allBars);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during Alpaca backfill for {Symbol}", request.Symbol);
            return BarFetchResult.Fail(ProviderName, ex.Message);
        }
    }
}
