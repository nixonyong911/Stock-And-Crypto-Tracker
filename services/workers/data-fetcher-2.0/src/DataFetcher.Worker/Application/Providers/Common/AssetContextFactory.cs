namespace DataFetcher.Worker.Application.Providers.Common;

public interface IAssetContextFactory
{
    IAssetContext GetContext(string assetType);
}

public class AssetContextFactory : IAssetContextFactory
{
    private readonly IEnumerable<IAssetContext> _contexts;

    public AssetContextFactory(IEnumerable<IAssetContext> contexts)
    {
        _contexts = contexts;
    }

    public IAssetContext GetContext(string assetType)
    {
        return _contexts.FirstOrDefault(c => c.AssetType.Equals(assetType, StringComparison.OrdinalIgnoreCase))
            ?? throw new ArgumentException($"Unknown asset type: {assetType}. Supported types: {string.Join(", ", _contexts.Select(c => c.AssetType))}");
    }
}
