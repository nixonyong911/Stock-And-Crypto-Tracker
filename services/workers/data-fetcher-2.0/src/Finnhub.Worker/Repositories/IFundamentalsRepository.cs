using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Repositories;

/// <summary>
/// Repository for stock fundamentals operations.
/// </summary>
public interface IFundamentalsRepository
{
    /// <summary>
    /// Upserts fundamental data for a stock ticker.
    /// </summary>
    Task UpsertAsync(FundamentalsData data);

    /// <summary>
    /// Gets the latest fundamentals for a ticker.
    /// </summary>
    Task<FundamentalsData?> GetLatestByTickerIdAsync(int stockTickerId);

    /// <summary>
    /// Gets fundamentals for a specific quarter.
    /// </summary>
    Task<FundamentalsData?> GetByTickerAndQuarterAsync(int stockTickerId, int fiscalYear, string fiscalQuarter);

    /// <summary>
    /// Gets the previous year's fundamentals for YoY calculations.
    /// </summary>
    Task<FundamentalsData?> GetPreviousYearQuarterAsync(int stockTickerId, int fiscalYear, string fiscalQuarter);

    /// <summary>
    /// Deletes records older than the specified number of quarters.
    /// </summary>
    Task DeleteOldRecordsAsync(int stockTickerId, int keepQuarters);
}
