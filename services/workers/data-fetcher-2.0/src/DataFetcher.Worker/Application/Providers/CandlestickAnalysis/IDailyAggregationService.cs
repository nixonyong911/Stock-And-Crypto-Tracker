using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Service for aggregating 15-minute candles into daily candles.
/// </summary>
public interface IDailyAggregationService
{
    /// <summary>
    /// Aggregate 15-minute candles into a single daily candle.
    /// </summary>
    DailyCandle? AggregateToDailyCandle(IEnumerable<StockPrice> prices, int stockTickerId, string symbol, DateOnly date);
}
