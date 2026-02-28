namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Raw crypto price from the crypto_prices table (15-minute candle).
/// Volume is decimal (not long like stock).
/// </summary>
public class CryptoPrice
{
    public long Id { get; set; }
    public int CryptoTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime PriceTime { get; set; }
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    public decimal Volume { get; set; }
    public DateTime CreatedAt { get; set; }
}
