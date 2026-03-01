namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public interface ICryptoPriceTargetRepository
{
    Task<IEnumerable<(DateOnly Date, decimal Close)>> GetRecentDailyClosesAsync(int cryptoTickerId, DateOnly asOfDate, int days);
    Task<(decimal? Ema20, decimal? Ema50, decimal? Rsi)?> GetLatestIndicatorAsync(int cryptoTickerId, DateOnly asOfDate);
    Task<IEnumerable<string>> GetRecentCandleSignalsAsync(int cryptoTickerId, DateOnly asOfDate, int days);
    Task<IEnumerable<DateOnly>> GetAnalyzedDatesAsync(int cryptoTickerId, DateOnly startDate, DateOnly endDate);
}
