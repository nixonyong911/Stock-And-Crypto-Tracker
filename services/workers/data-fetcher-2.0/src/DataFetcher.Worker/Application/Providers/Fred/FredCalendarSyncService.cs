using DataFetcher.Worker.Domain.Providers.Fred.Entities;
using DataFetcher.Worker.Domain.Providers.Fred.Models;
using DataFetcher.Worker.Infrastructure.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Fred;

public class FredCalendarSyncService : IFredCalendarSyncService
{
    private readonly IFredApiClient _apiClient;
    private readonly IFredRepository _repository;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<FredCalendarSyncService> _logger;

    public FredCalendarSyncService(
        IFredApiClient apiClient,
        IFredRepository repository,
        IMetricsClient metrics,
        ILogger<FredCalendarSyncService> logger)
    {
        _apiClient = apiClient;
        _repository = repository;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<(int SuccessCount, int ErrorCount)> SyncCalendarAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting calendar sync");

        var indicators = await _repository.GetActiveIndicatorsAsync();
        _logger.LogInformation("Syncing calendar for {Count} indicators", indicators.Count);

        var successCount = 0;
        var errorCount = 0;
        var releaseDatesCache = new Dictionary<int, List<FredReleaseDate>>();

        foreach (var ind in indicators)
        {
            try
            {
                var releaseInfo = await _apiClient.GetSeriesReleaseAsync(ind.SeriesId, cancellationToken);
                if (releaseInfo == null)
                {
                    _logger.LogError("Failed to get release info for {SeriesId}", ind.SeriesId);
                    errorCount++;
                    continue;
                }

                if (!releaseDatesCache.TryGetValue(releaseInfo.ReleaseId, out var dates))
                {
                    try
                    {
                        dates = await _apiClient.GetReleaseDatesAsync(releaseInfo.ReleaseId, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to get release dates for release {ReleaseId}", releaseInfo.ReleaseId);
                        dates = new List<FredReleaseDate>();
                    }
                    releaseDatesCache[releaseInfo.ReleaseId] = dates;
                }

                var entry = new ReleaseCalendarEntry
                {
                    SeriesId = ind.SeriesId,
                    ReleaseId = releaseInfo.ReleaseId,
                    ReleaseName = releaseInfo.ReleaseName,
                    ReleaseLink = releaseInfo.ReleaseLink ?? string.Empty,
                    ReleaseFrequency = FredApiClient.GetReleaseFrequency(dates)
                };

                if (dates.Count > 0) entry.NextReleaseDate = dates[0].Date;
                if (dates.Count > 1) entry.FollowingReleaseDate = dates[1].Date;

                await _repository.UpsertReleaseCalendarAsync(entry);
                successCount++;

                _logger.LogInformation("Updated calendar for {SeriesId}: {ReleaseName}, next={NextDate}",
                    ind.SeriesId, releaseInfo.ReleaseName, entry.NextReleaseDate);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync calendar for {SeriesId}", ind.SeriesId);
                errorCount++;
            }
        }

        await _metrics.IncrementCounterAsync("fred_calendar_sync_total", 1,
            new Dictionary<string, string> { ["status"] = "completed" });

        _logger.LogInformation("Calendar sync completed: {Success} success, {Errors} errors", successCount, errorCount);
        return (successCount, errorCount);
    }
}
