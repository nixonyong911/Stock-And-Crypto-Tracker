using Microsoft.Extensions.Logging;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaAssetVerificationService : IAlpacaAssetVerificationService
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly ILogger<AlpacaAssetVerificationService> _logger;

    public AlpacaAssetVerificationService(
        IAlpacaMarketDataClient apiClient,
        ILogger<AlpacaAssetVerificationService> logger)
    {
        _apiClient = apiClient;
        _logger = logger;
    }

    public async Task<AssetVerificationResult> VerifyAsync(string symbol, string assetType, CancellationToken cancellationToken = default)
    {
        try
        {
            var lookupSymbol = assetType.ToLowerInvariant() == "crypto"
                ? symbol.Replace("/", "")
                : symbol.ToUpperInvariant();

            _logger.LogDebug("Verifying {AssetType} symbol {Symbol} (lookup: {Lookup})", assetType, symbol, lookupSymbol);

            var asset = await _apiClient.GetAssetAsync(lookupSymbol, cancellationToken);

            if (asset == null)
            {
                _logger.LogInformation("{AssetType} symbol {Symbol} not found", assetType, symbol);
                return AssetVerificationResult.NotFound(symbol);
            }

            _logger.LogInformation("{AssetType} symbol {Symbol} verified: {Name} on {Exchange}",
                assetType, symbol, asset.Name, asset.Exchange);

            return AssetVerificationResult.Success(symbol, asset.Name, asset.Exchange);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying {AssetType} symbol {Symbol}", assetType, symbol);
            return AssetVerificationResult.Failed(symbol, ex.Message);
        }
    }
}
