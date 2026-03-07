using DataFetcher.Worker.Domain.Providers.Alpaca.Entities;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaStockPriceRepository
{
    Task<DataSource?> GetDataSourceByNameAsync(string name);
    Task UpsertStockPricesBatchAsync(IList<AlpacaStockPriceRow> prices);
}

public class AlpacaStockPriceRow
{
    public int StockTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime PriceTime { get; set; }
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    public long Volume { get; set; }
}
