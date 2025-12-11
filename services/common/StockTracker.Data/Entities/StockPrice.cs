namespace StockTracker.Data.Entities;

/// <summary>
/// Stock price data (10-minute candles).
/// Each row represents one candlestick for AI pattern analysis.
/// Retention: 90 days of intraday data.
/// </summary>
public class StockPrice
{
    public long Id { get; set; }
    public int StockTickerId { get; set; }
    public int DataSourceId { get; set; }
    
    /// <summary>
    /// Start of the 10-minute period (e.g., 09:30:00, 09:40:00).
    /// </summary>
    public DateTime PriceTime { get; set; }
    
    // OHLC - Forms one candlestick
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    
    /// <summary>
    /// Number of shares traded in this 10-minute period.
    /// </summary>
    public long Volume { get; set; }
    
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    public StockTicker StockTicker { get; set; } = null!;
    public DataSource DataSource { get; set; } = null!;
}

