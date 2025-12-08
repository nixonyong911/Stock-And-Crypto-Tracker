namespace AlphaVantage.Worker.Models;

public class StockDailyPrice
{
    public Guid Id { get; set; }
    public Guid StockId { get; set; }
    public Guid DataSourceId { get; set; }
    public DateTime PriceDate { get; set; }
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    public decimal? AdjustedClose { get; set; }
    public long Volume { get; set; }
}

