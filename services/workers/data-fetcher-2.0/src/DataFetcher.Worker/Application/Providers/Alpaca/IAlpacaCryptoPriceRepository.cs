namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaCryptoPriceRepository
{
    Task UpsertCryptoPricesBatchAsync(IList<AlpacaCryptoPriceRow> prices);
}

public class AlpacaCryptoPriceRow
{
    public int CryptoTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime PriceTime { get; set; }
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    public long Volume { get; set; }
    public decimal? MarketCap { get; set; }
}
