using CandlestickAnalysis.Worker.Models;

namespace CandlestickAnalysis.Worker.Repositories;

/// <summary>
/// Repository for reading stock prices.
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
    
    /// <summary>
    /// Get the analysis schedule for CandlestickAnalysis.
    /// </summary>
    Task<AnalysisSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName);
    
    /// <summary>
    /// Update schedule after run.
    /// </summary>
    Task UpdateScheduleStatusAsync(int scheduleId, string status, string message);
}

