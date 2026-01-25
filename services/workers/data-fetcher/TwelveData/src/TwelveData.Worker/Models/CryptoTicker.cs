namespace TwelveData.Worker.Models;

/// <summary>
/// Represents a crypto ticker from the crypto_tickers table
/// </summary>
public class CryptoTicker
{
    public int Id { get; set; }
    public int UniverseId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Slug { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
