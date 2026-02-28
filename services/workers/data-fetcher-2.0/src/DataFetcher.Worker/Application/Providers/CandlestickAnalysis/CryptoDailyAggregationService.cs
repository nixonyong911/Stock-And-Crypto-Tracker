using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Aggregates 15-minute crypto candles into a daily candle.
/// No market hours filter — crypto trades 24/7.
/// </summary>
public class CryptoDailyAggregationService : ICryptoDailyAggregationService
{
    private readonly ILogger<CryptoDailyAggregationService> _logger;

    public CryptoDailyAggregationService(ILogger<CryptoDailyAggregationService> logger)
    {
        _logger = logger;
    }

    public CryptoDailyCandle? AggregateToDailyCandle(IEnumerable<CryptoPrice> prices, int cryptoTickerId, string symbol, DateOnly date)
    {
        var priceList = prices.OrderBy(p => p.PriceTime).ToList();

        if (priceList.Count == 0)
        {
            _logger.LogWarning("No crypto prices to aggregate for {Symbol} on {Date}", symbol, date);
            return null;
        }

        return new CryptoDailyCandle
        {
            CryptoTickerId = cryptoTickerId,
            Symbol = symbol,
            AnalysisDate = date,
            Open = priceList.First().OpenPrice,
            High = priceList.Max(p => p.HighPrice),
            Low = priceList.Min(p => p.LowPrice),
            Close = priceList.Last().ClosePrice,
            Volume = priceList.Sum(p => p.Volume),
            CandlesAggregated = priceList.Count
        };
    }
}
