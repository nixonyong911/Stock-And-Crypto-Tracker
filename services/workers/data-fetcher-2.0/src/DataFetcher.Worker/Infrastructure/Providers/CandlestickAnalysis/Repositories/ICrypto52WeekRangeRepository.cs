using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

/// <summary>
/// Repository for the crypto 52-week range table (analysis_crypto_range_52w).
/// </summary>
public interface ICrypto52WeekRangeRepository
{
    /// <summary>
    /// Upserts the 52-week range for a crypto ticker (one row per ticker).
    /// </summary>
    Task UpsertAsync(Crypto52WeekRange range);

    /// <summary>
    /// Returns ticker ids whose range was already computed on or after the
    /// given UTC timestamp. Used to make the daily compute step idempotent
    /// when the pipeline fires more than once per day.
    /// </summary>
    Task<IReadOnlySet<int>> GetComputedSinceAsync(DateTime sinceUtc);
}
