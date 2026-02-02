using SimFin.Worker.Models;

namespace SimFin.Worker.Repositories;

public interface IFundamentalsRepository
{
    /// <summary>
    /// Upserts fundamentals data for a single ticker.
    /// Uses INSERT ON CONFLICT to update existing row.
    /// </summary>
    Task UpsertFundamentalsAsync(FundamentalsData data);
}
