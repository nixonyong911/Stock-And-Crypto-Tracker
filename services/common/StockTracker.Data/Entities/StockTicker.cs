namespace StockTracker.Data.Entities;

/// <summary>
/// Stock/ETF master list.
/// Each ticker represents a tradable stock or ETF instrument.
/// </summary>
public class StockTicker
{
    public int Id { get; set; }
    public int UniverseId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Exchange { get; set; }
    public string Currency { get; set; } = "USD";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public Universe Universe { get; set; } = null!;
    public ICollection<StockPrice> Prices { get; set; } = new List<StockPrice>();
}

