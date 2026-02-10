namespace DataFetcher.Worker.Application;

/// <summary>
/// Registry for discovering available data providers.
/// </summary>
public interface IProviderRegistry
{
    /// <summary>
    /// Registers a provider with the registry.
    /// </summary>
    /// <param name="info">The provider information to register.</param>
    void Register(ProviderInfo info);

    /// <summary>
    /// Gets all registered providers.
    /// </summary>
    /// <returns>A read-only list of all registered providers.</returns>
    IReadOnlyList<ProviderInfo> GetAll();
}

/// <summary>
/// Describes a data provider's capabilities and endpoints.
/// </summary>
public class ProviderInfo
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string StatusEndpoint { get; set; } = string.Empty;
    public string SwaggerGroup { get; set; } = string.Empty;
    public List<string> Capabilities { get; set; } = new();
}

/// <summary>
/// Provider registry implementation.
/// </summary>
public class ProviderRegistry : IProviderRegistry
{
    private readonly List<ProviderInfo> _providers = new();

    public void Register(ProviderInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        _providers.Add(info);
    }

    public IReadOnlyList<ProviderInfo> GetAll()
    {
        return _providers.AsReadOnly();
    }
}
