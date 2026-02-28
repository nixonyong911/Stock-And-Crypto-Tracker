using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public interface ICryptoDailyAggregationService
{
    CryptoDailyCandle? AggregateToDailyCandle(IEnumerable<CryptoPrice> prices, int cryptoTickerId, string symbol, DateOnly date);
}
