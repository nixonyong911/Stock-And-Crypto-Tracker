namespace TwelveData.Worker.Models;

/// <summary>
/// Represents a stock ticker from the stock_tickers table
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
}

