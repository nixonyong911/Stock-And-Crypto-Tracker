using DataFetcher.Worker.Domain.Providers.Alpaca.Models;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaAssetVerificationService
{
    Task<AssetVerificationResult> VerifyAsync(string symbol, string assetType, CancellationToken cancellationToken = default);
}

public class AssetVerificationResult
{
    public bool Found { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Exchange { get; set; }
    public string? Error { get; set; }

    public static AssetVerificationResult Success(string symbol, string? name, string? exchange)
        => new() { Found = true, Symbol = symbol, Name = name, Exchange = exchange };

    public static AssetVerificationResult NotFound(string symbol)
        => new() { Found = false, Symbol = symbol };

    public static AssetVerificationResult Failed(string symbol, string error)
        => new() { Found = false, Symbol = symbol, Error = error };
}
