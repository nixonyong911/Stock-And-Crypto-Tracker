using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public interface IPriceTargetRepository
{
    Task InsertAsync(PriceTarget target);
    Task<IEnumerable<(DateOnly Date, decimal Close)>> GetRecentDailyClosesAsync(int stockTickerId, DateOnly asOfDate, int days);
    Task<(decimal? Ema20, decimal? Ema50, decimal? Rsi)?> GetLatestIndicatorAsync(int stockTickerId, DateOnly asOfDate);
    Task<IEnumerable<string>> GetRecentCandleSignalsAsync(int stockTickerId, DateOnly asOfDate, int days);
}
