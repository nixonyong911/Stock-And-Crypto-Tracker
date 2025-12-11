namespace StockTracker.Data.Entities;

/// <summary>
/// Crypto price data (10-minute candles).
/// Each row represents one candlestick for AI pattern analysis.
/// Retention: 90 days of intraday data.
/// </summary>
public class CryptoPrice
{
    public long Id { get; set; }
    public int CryptoTickerId { get; set; }
    public int DataSourceId { get; set; }
    
    /// <summary>
    /// Start of the 10-minute period.
    /// Crypto trades 24/7, so 144 candles per day.
    /// </summary>
    public DateTime PriceTime { get; set; }
    
    // OHLC - Forms one candlestick
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    
    /// <summary>
    /// Trading volume in quote currency (e.g., USD).
    /// </summary>
    public decimal Volume { get; set; }
    
    /// <summary>
    /// Market capitalization at period end.
    /// Useful for AI to rank cryptos by size.
    /// </summary>
    public decimal? MarketCap { get; set; }
    
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    public CryptoTicker CryptoTicker { get; set; } = null!;
    public DataSource DataSource { get; set; } = null!;
}

