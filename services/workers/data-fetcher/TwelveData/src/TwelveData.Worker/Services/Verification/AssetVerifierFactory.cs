using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services.Verification;

/// <summary>
/// Factory for obtaining the appropriate asset verifier based on asset type
/// </summary>
public interface IAssetVerifierFactory
{
    /// <summary>
    /// Gets the verifier for the specified asset type
    /// </summary>
    IAssetVerifier GetVerifier(AssetType assetType);
    
    /// <summary>
    /// Gets all registered verifiers
    /// </summary>
    IEnumerable<IAssetVerifier> GetAllVerifiers();
}

public class AssetVerifierFactory : IAssetVerifierFactory
{
    private readonly Dictionary<AssetType, IAssetVerifier> _verifiers;

    public AssetVerifierFactory(IEnumerable<IAssetVerifier> verifiers)
    {
        _verifiers = verifiers.ToDictionary(v => v.AssetType);
    }

    public IAssetVerifier GetVerifier(AssetType assetType)
    {
        if (!_verifiers.TryGetValue(assetType, out var verifier))
        {
            throw new ArgumentException($"No verifier registered for asset type: {assetType}");
        }
        
        return verifier;
    }

    public IEnumerable<IAssetVerifier> GetAllVerifiers() => _verifiers.Values;
}
