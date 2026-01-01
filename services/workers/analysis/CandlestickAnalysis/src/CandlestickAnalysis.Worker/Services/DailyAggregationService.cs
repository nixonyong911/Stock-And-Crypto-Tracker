using Microsoft.Extensions.Logging;
using CandlestickAnalysis.Worker.Models;

namespace CandlestickAnalysis.Worker.Services;

/// <summary>
/// Service for aggregating 15-minute candles into daily candles.
/// </summary>
public class DailyAggregationService : IDailyAggregationService
{
    private readonly ILogger<DailyAggregationService> _logger;

    public DailyAggregationService(ILogger<DailyAggregationService> logger)
    {
        _logger = logger;
    }

    public DailyCandle? AggregateToDailyCandle(IEnumerable<StockPrice> prices, int stockTickerId, string symbol, DateOnly date)
    {
        var priceList = prices.OrderBy(p => p.PriceTime).ToList();

        if (priceList.Count == 0)
        {
            _logger.LogWarning("No prices found for {Symbol} on {Date}", symbol, date);
            return null;
        }

        // Aggregate OHLCV:
        // Open = first candle's open
        // High = max high across all candles
        // Low = min low across all candles
        // Close = last candle's close
        // Volume = sum of all volumes

        var dailyCandle = new DailyCandle
        {
            StockTickerId = stockTickerId,
            Symbol = symbol,
            AnalysisDate = date,
            Open = priceList.First().OpenPrice,
            High = priceList.Max(p => p.HighPrice),
            Low = priceList.Min(p => p.LowPrice),
            Close = priceList.Last().ClosePrice,
            Volume = priceList.Sum(p => p.Volume),
            CandlesAggregated = priceList.Count
        };

        _logger.LogDebug(
            "Aggregated {Count} candles for {Symbol} on {Date}: O={Open} H={High} L={Low} C={Close} V={Volume}",
            priceList.Count, symbol, date,
            dailyCandle.Open, dailyCandle.High, dailyCandle.Low, dailyCandle.Close, dailyCandle.Volume);

        return dailyCandle;
    }
}

