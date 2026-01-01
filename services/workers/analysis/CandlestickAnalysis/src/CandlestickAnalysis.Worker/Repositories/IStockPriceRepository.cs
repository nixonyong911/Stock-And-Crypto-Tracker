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
    /// Get 15-minute candles for a specific stock on a specific date.
    /// </summary>
    Task<IEnumerable<StockPrice>> GetPricesForDateAsync(int stockTickerId, DateOnly date);
    
    /// <summary>
    /// Get the analysis schedule for CandlestickAnalysis.
    /// </summary>
    Task<AnalysisSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName);
    
    /// <summary>
    /// Update schedule after run.
    /// </summary>
    Task UpdateScheduleStatusAsync(int scheduleId, string status, string message);
}

