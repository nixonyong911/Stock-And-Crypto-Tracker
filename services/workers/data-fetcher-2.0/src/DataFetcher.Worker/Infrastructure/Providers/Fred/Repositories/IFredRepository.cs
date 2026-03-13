using DataFetcher.Worker.Domain.Providers.Fred.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;

public interface IFredRepository
{
    Task<List<EconomicIndicator>> GetActiveIndicatorsAsync();
    Task<List<IndicatorStatus>> GetAllIndicatorStatusAsync();
    Task<EconomicIndicator?> GetIndicatorBySeriesIdAsync(string seriesId);
    Task UpsertIndicatorAsync(string seriesId, double value, DateTime date);
    Task UpsertIndicatorWithMediaAsync(
        string seriesId, double value, DateTime date,
        double? mediaValue, double? yoyValue, DateTime? yoyDate, DateTime? lastReleaseDate);
    Task UpsertReleaseCalendarAsync(ReleaseCalendarEntry entry);
    Task<List<ReleaseCalendarEntry>> GetAllReleaseCalendarAsync();
    Task<List<ReleaseCalendarEntry>> GetUpcomingReleasesAsync(int days);
}
