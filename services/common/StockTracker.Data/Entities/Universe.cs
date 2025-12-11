namespace StockTracker.Data.Entities;

/// <summary>
/// Asset type classification (stock, etf, crypto).
/// Lookup table for minimal storage - referenced by ticker tables.
/// </summary>
public class Universe
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public ICollection<StockTicker> StockTickers { get; set; } = new List<StockTicker>();
    public ICollection<CryptoTicker> CryptoTickers { get; set; } = new List<CryptoTicker>();
}

