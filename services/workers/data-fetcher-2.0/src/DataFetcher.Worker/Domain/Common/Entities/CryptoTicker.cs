namespace DataFetcher.Worker.Domain.Common.Entities;

/// <summary>
/// Crypto ticker information from crypto_tickers table.
/// </summary>
public class CryptoTicker
{
    public int Id { get; set; }
    public int UniverseId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Slug { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// Converts DB symbol (e.g. "BTC/USD") to Massive API format (e.g. "X:BTCUSD").
    /// </summary>
    public string ToMassiveSymbol()
    {
        return $"X:{Symbol.Replace("/", "")}";
    }
}
