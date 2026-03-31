using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

public interface ICryptoTickerRepository
{
    Task<IEnumerable<CryptoTicker>> GetActiveTickersAsync();
    Task<IEnumerable<CryptoTicker>> GetTickersByDataSourceAsync(int dataSourceId);
    Task<CryptoTicker?> GetByIdAsync(int id);
    Task<CryptoTicker?> GetBySymbolAsync(string symbol);
}
