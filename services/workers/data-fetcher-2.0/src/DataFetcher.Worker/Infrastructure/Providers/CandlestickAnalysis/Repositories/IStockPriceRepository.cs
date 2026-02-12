using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

/// <summary>
/// Repository for reading stock prices used in candlestick analysis.
/// </summary>
public interface IStockPriceRepository
{
    /// <summary>
    /// Get all active stock tickers.
    /// </summary>
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync();

    /// <summary>
    /// Get a ticker by symbol.
    /// </summary>
    Task<StockTicker?> GetTickerBySymbolAsync(string symbol);

    /// <summary>
    /// Get 15-minute candles for a specific stock on a specific date.
    /// </summary>
    Task<IEnumerable<StockPrice>> GetPricesForDateAsync(int stockTickerId, DateOnly date);

    /// <summary>
    /// Get distinct dates that have price data for a ticker within a date range.
    /// Used for backfill to find which dates have data to analyze.
    /// </summary>
    Task<IEnumerable<DateOnly>> GetDistinctPriceDatesAsync(int stockTickerId, DateOnly startDate, DateOnly endDate);
}
