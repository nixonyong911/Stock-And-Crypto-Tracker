using YahooFinance.Worker.Models;

namespace YahooFinance.Worker.Repositories;

public interface IFundamentalsRepository
{
    /// <summary>
    /// Upserts fundamentals data for a single ticker.
    /// Uses INSERT ON CONFLICT to update existing row.
    /// </summary>
    Task UpsertFundamentalsAsync(FundamentalsData data);

    /// <summary>
    /// Upserts earnings calendar data.
    /// Uses INSERT ON CONFLICT on (stock_ticker_id, earnings_date).
    /// </summary>
    Task UpsertEarningsAsync(EarningsData data);
}
