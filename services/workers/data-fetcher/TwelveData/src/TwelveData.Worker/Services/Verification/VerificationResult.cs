using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services.Verification;

/// <summary>
/// Result of ticker verification against Twelve Data reference endpoints
/// </summary>
public record VerificationResult
{
    /// <summary>
    /// Whether the symbol was found and is valid
    /// </summary>
    public bool IsValid { get; init; }
    
    /// <summary>
    /// Asset type that was verified
    /// </summary>
    public AssetType AssetType { get; init; }
    
    /// <summary>
    /// Symbol that was verified
    /// </summary>
    public string Symbol { get; init; } = string.Empty;
    
    /// <summary>
    /// Full name of the asset (e.g., "Apple Inc")
    /// </summary>
    public string? Name { get; init; }
    
    /// <summary>
    /// Exchange where the asset is traded (e.g., "NASDAQ")
    /// </summary>
    public string? Exchange { get; init; }
    
    /// <summary>
    /// Currency of the asset (e.g., "USD")
    /// </summary>
    public string? Currency { get; init; }
    
    /// <summary>
    /// Country code (e.g., "United States")
    /// </summary>
    public string? Country { get; init; }
    
    /// <summary>
    /// Error message if verification failed
    /// </summary>
    public string? ErrorMessage { get; init; }
    
    public static VerificationResult Success(
        AssetType assetType,
        string symbol,
        string? name,
        string? exchange,
        string? currency,
        string? country) => new()
    {
        IsValid = true,
        AssetType = assetType,
        Symbol = symbol,
        Name = name,
        Exchange = exchange,
        Currency = currency,
        Country = country
    };
    
    public static VerificationResult NotFound(AssetType assetType, string symbol) => new()
    {
        IsValid = false,
        AssetType = assetType,
        Symbol = symbol,
        ErrorMessage = $"Symbol '{symbol}' not found in Twelve Data {assetType} catalog"
    };
    
    public static VerificationResult Error(AssetType assetType, string symbol, string error) => new()
    {
        IsValid = false,
        AssetType = assetType,
        Symbol = symbol,
        ErrorMessage = error
    };
}
