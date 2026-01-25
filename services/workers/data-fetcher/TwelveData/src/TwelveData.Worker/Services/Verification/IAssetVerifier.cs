using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services.Verification;

/// <summary>
/// Strategy interface for verifying assets against Twelve Data reference endpoints.
/// Each asset type (Stock, ETF, Crypto) has its own implementation.
/// </summary>
public interface IAssetVerifier
{
    /// <summary>
    /// The asset type this verifier handles
    /// </summary>
    AssetType AssetType { get; }
    
    /// <summary>
    /// Verifies if a symbol exists in Twelve Data's catalog for this asset type
    /// </summary>
    /// <param name="symbol">The symbol to verify (e.g., "AAPL", "BTC/USD")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Verification result with asset details if found</returns>
    Task<VerificationResult> VerifyAsync(string symbol, CancellationToken cancellationToken = default);
}
