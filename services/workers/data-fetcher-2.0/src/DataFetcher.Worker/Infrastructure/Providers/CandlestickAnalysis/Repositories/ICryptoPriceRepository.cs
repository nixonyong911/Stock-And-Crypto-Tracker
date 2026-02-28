using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

public interface ICryptoPriceRepository
{
    Task<IEnumerable<CryptoTicker>> GetActiveTickersAsync();
    Task<CryptoTicker?> GetTickerBySymbolAsync(string symbol);
    Task<IEnumerable<CryptoPrice>> GetPricesForDateAsync(int cryptoTickerId, DateOnly date);
    Task<IEnumerable<DateOnly>> GetDistinctPriceDatesAsync(int cryptoTickerId, DateOnly startDate, DateOnly endDate);
}
