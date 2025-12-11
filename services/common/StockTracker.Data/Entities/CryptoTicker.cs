namespace StockTracker.Data.Entities;

/// <summary>
/// Cryptocurrency master list.
/// Each ticker represents a tradable cryptocurrency.
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

    // Navigation properties
    public Universe Universe { get; set; } = null!;
    public ICollection<CryptoPrice> Prices { get; set; } = new List<CryptoPrice>();
}

