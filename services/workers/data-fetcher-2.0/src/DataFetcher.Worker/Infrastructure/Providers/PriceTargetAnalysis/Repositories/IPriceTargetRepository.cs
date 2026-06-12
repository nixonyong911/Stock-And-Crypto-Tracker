using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public interface IPriceTargetRepository
{
    Task InsertAsync(PriceTarget target);
    Task<IEnumerable<(DateOnly Date, decimal Close, decimal? Open)>> GetRecentDailyClosesAsync(int stockTickerId, DateOnly asOfDate, int days);
    Task<(decimal? Ema20, decimal? Sma20, decimal? Rsi)?> GetLatestIndicatorAsync(int stockTickerId, DateOnly asOfDate);
    Task<IEnumerable<string>> GetRecentCandleSignalsAsync(int stockTickerId, DateOnly asOfDate, int days);
    Task<IEnumerable<DateOnly>> GetComputedDatesAsync(string symbol, DateOnly startDate, DateOnly endDate, string? traderType = null);
    Task<int> DeleteOlderThanAsync(int retentionDays = 90);
}
