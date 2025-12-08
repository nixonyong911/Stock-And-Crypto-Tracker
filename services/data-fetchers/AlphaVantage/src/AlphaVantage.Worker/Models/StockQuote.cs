namespace AlphaVantage.Worker.Models;

public class StockQuote
{
    public string Symbol { get; set; } = string.Empty;
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Price { get; set; }
    public long Volume { get; set; }
    public DateTime LatestTradingDay { get; set; }
    public decimal PreviousClose { get; set; }
    public decimal Change { get; set; }
    public string ChangePercent { get; set; } = string.Empty;
}

