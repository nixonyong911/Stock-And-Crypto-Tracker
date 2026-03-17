using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Infrastructure.Common;
using Dapper;

namespace DataFetcher.Worker.Application.Providers.Common;

public class MarketDataResolver : IMarketDataResolver
{
    private readonly AlpacaMarketDataProvider _alpaca;
    private readonly EtoroMarketDataProvider _etoro;
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<MarketDataResolver> _logger;

    public MarketDataResolver(
        AlpacaMarketDataProvider alpaca,
        EtoroMarketDataProvider etoro,
        IDbConnectionFactory connectionFactory,
        ILogger<MarketDataResolver> logger)
    {
        _alpaca = alpaca;
        _etoro = etoro;
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<ResolveResult> VerifyAndResolveAsync(string symbol, string assetType, CancellationToken ct = default)
    {
        if (assetType.Equals("commodity", StringComparison.OrdinalIgnoreCase) ||
            assetType.Equals("index", StringComparison.OrdinalIgnoreCase))
        {
            var catalogResult = TryResolveFromCatalog(symbol, assetType);
            if (catalogResult != null)
                return await FinalizeCatalogResult(catalogResult, symbol);

            _logger.LogInformation(
                "Symbol {Symbol} ({AssetType}) not found in hardcoded catalog — skipping API call",
                symbol, assetType);
            return ResolveResult.NotFound(symbol);
        }

        return await ResolveViaProviders(symbol, assetType, ct);
    }

    private ResolveResult? TryResolveFromCatalog(string symbol, string assetType)
    {
        if (EtoroAssetCatalog.TryLookup(symbol, assetType, out var entry) && entry != null)
        {
            _logger.LogInformation(
                "Resolved {Symbol} ({AssetType}) from catalog: {DisplayName} (instrumentId={InstrumentId})",
                symbol, assetType, entry.DisplayName, entry.InstrumentId);

            return ResolveResult.Success(
                entry.EtoroSymbol, "eToro", dataSourceId: 0,
                entry.DisplayName, entry.Exchange, entry.InstrumentId);
        }

        if (EtoroAssetCatalog.TryLookupByAlias(symbol, out var aliasEntry) && aliasEntry != null &&
            aliasEntry.AssetType.Equals(assetType, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation(
                "Resolved alias '{Alias}' → {Symbol} ({AssetType}) from catalog: {DisplayName} (instrumentId={InstrumentId})",
                symbol, aliasEntry.EtoroSymbol, assetType, aliasEntry.DisplayName, aliasEntry.InstrumentId);

            return ResolveResult.Success(
                aliasEntry.EtoroSymbol, "eToro", dataSourceId: 0,
                aliasEntry.DisplayName, aliasEntry.Exchange, aliasEntry.InstrumentId);
        }

        return null;
    }

    private async Task<ResolveResult> FinalizeCatalogResult(ResolveResult catalogResult, string originalSymbol)
    {
        var dataSourceId = await GetDataSourceIdAsync("eToro");
        if (dataSourceId == 0)
            return ResolveResult.Failed(originalSymbol, "Data source 'eToro' not found in database");

        return ResolveResult.Success(
            catalogResult.Symbol, catalogResult.PrimaryProvider!, dataSourceId,
            catalogResult.Name, catalogResult.Exchange, catalogResult.EtoroInstrumentId);
    }

    private async Task<ResolveResult> ResolveViaProviders(string symbol, string assetType, CancellationToken ct)
    {
        var providers = GetProviderOrder(assetType);
        _logger.LogInformation("Resolving {Symbol} ({AssetType}) — provider order: {Order}",
            symbol, assetType, string.Join(" → ", providers.Select(p => p.ProviderName)));

        AssetLookupResult? primaryResult = null;
        IMarketDataProvider? primaryProvider = null;

        foreach (var provider in providers)
        {
            if (!provider.Capabilities.Supports(assetType))
                continue;

            var result = await provider.LookupAssetAsync(symbol, assetType, ct);

            if (result.Found)
            {
                primaryResult = result;
                primaryProvider = provider;
                break;
            }

            _logger.LogDebug("{Provider}: {Symbol} not found", provider.ProviderName, symbol);
        }

        if (primaryResult == null || primaryProvider == null)
        {
            _logger.LogInformation("Symbol {Symbol} ({AssetType}) not found on any provider", symbol, assetType);
            return ResolveResult.NotFound(symbol);
        }

        var dataSourceId = await GetDataSourceIdAsync(primaryProvider.ProviderName);
        if (dataSourceId == 0)
        {
            return ResolveResult.Failed(symbol, $"Data source not found for provider '{primaryProvider.ProviderName}'");
        }

        int? etoroInstrumentId = primaryResult.EtoroInstrumentId;

        if (etoroInstrumentId == null && primaryProvider.ProviderName != "eToro" && _etoro.Capabilities.Supports(assetType))
        {
            try
            {
                var etoroResult = await _etoro.LookupAssetAsync(symbol, assetType, ct);
                if (etoroResult.Found)
                {
                    etoroInstrumentId = etoroResult.EtoroInstrumentId;
                    _logger.LogInformation("Also resolved eToro instrumentId={InstrumentId} for {Symbol} (fallback)",
                        etoroInstrumentId, symbol);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Non-fatal: failed to resolve eToro instrumentId for {Symbol}", symbol);
            }
        }

        return ResolveResult.Success(
            symbol, primaryProvider.ProviderName, dataSourceId,
            primaryResult.Name, primaryResult.Exchange, etoroInstrumentId);
    }

    private List<IMarketDataProvider> GetProviderOrder(string assetType) =>
        assetType.ToLowerInvariant() switch
        {
            "crypto" => [_etoro, _alpaca],
            _ => [_alpaca, _etoro]
        };

    private async Task<int> GetDataSourceIdAsync(string providerName)
    {
        using var connection = _connectionFactory.CreateConnection();
        return await connection.QueryFirstOrDefaultAsync<int>(
            "SELECT id FROM lookup_data_sources WHERE name = @Name AND is_active = true",
            new { Name = providerName });
    }
}
