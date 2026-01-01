namespace TwelveData.Worker.Models;

/// <summary>
/// Represents a stock price record for insertion into stock_prices table
/// </summary>
public class StockPrice
{
    public long Id { get; set; }
    public int StockTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime PriceTime { get; set; }
    public decimal? OpenPrice { get; set; }
    public decimal? HighPrice { get; set; }
    public decimal? LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    public long? Volume { get; set; }
    public DateTime CreatedAt { get; set; }
}

