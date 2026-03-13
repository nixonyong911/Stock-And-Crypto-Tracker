using DataFetcher.Worker.Domain.Providers.Fred.Models;
using DataFetcher.Worker.Infrastructure.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Fred;

public class FredFetchService : IFredFetchService
{
    private readonly IFredApiClient _apiClient;
    private readonly IFredRepository _repository;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<FredFetchService> _logger;

    public FredFetchService(
        IFredApiClient apiClient,
        IFredRepository repository,
        IMetricsClient metrics,
        ILogger<FredFetchService> logger)
    {
        _apiClient = apiClient;
        _repository = repository;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<(int SuccessCount, int ErrorCount)> FetchAllIndicatorsAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting FRED indicator fetch");

        var indicators = await _repository.GetActiveIndicatorsAsync();
        _logger.LogInformation("Fetching {Count} indicators", indicators.Count);

        var successCount = 0;
        var errorCount = 0;
        var releaseCache = new Dictionary<int, List<FredReleaseDate>>();

        foreach (var ind in indicators)
        {
            try
            {
                var obs = await _apiClient.GetLatestObservationAsync(ind.SeriesId, cancellationToken);
                if (obs == null)
                {
                    _logger.LogError("Failed to fetch indicator {SeriesId}: no observation", ind.SeriesId);
                    errorCount++;
                    await _metrics.IncrementCounterAsync("fred_fetch_errors_total", 1,
                        new Dictionary<string, string> { ["series_id"] = ind.SeriesId, ["error_type"] = "api_error" });
                    continue;
                }

                double? mediaValue = null;
                double? yoyValue = null;
                DateTime? yoyDate = null;

                if (MediaValueCalculator.NeedsYearAgoData(ind.DisplayMode))
                {
                    var yoyObs = await _apiClient.GetYearAgoObservationAsync(ind.SeriesId, obs.Date, cancellationToken);
                    if (yoyObs != null)
                    {
                        yoyValue = yoyObs.Value;
                        yoyDate = yoyObs.Date;
                        mediaValue = MediaValueCalculator.CalculateMediaValue(ind.DisplayMode, obs.Value, yoyValue, ind.DisplayDivisor);
                    }
                    else
                    {
                        _logger.LogWarning("Failed to fetch year-ago observation for {SeriesId}, skipping YoY calc", ind.SeriesId);
                    }
                }
                else
                {
                    mediaValue = MediaValueCalculator.CalculateMediaValue(ind.DisplayMode, obs.Value, null, ind.DisplayDivisor);
                }

                DateTime? lastReleaseDate = null;
                try
                {
                    var releaseInfo = await _apiClient.GetSeriesReleaseAsync(ind.SeriesId, cancellationToken);
                    if (releaseInfo != null)
                    {
                        if (!releaseCache.TryGetValue(releaseInfo.ReleaseId, out var pastDates))
                        {
                            pastDates = await _apiClient.GetPastReleaseDatesAsync(releaseInfo.ReleaseId, cancellationToken);
                            releaseCache[releaseInfo.ReleaseId] = pastDates;
                        }
                        if (pastDates.Count > 0)
                        {
                            lastReleaseDate = pastDates[0].Date;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to fetch release info for {SeriesId}", ind.SeriesId);
                }

                await _repository.UpsertIndicatorWithMediaAsync(
                    ind.SeriesId, obs.Value, obs.Date, mediaValue, yoyValue, yoyDate, lastReleaseDate);

                successCount++;
                _logger.LogInformation("Updated indicator {SeriesId}: raw={RawValue}, media={MediaValue}, mode={DisplayMode}, date={Date}, releaseDate={ReleaseDate}",
                    ind.SeriesId, obs.Value, mediaValue, ind.DisplayMode, obs.Date, lastReleaseDate);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process indicator {SeriesId}", ind.SeriesId);
                errorCount++;
                await _metrics.IncrementCounterAsync("fred_fetch_errors_total", 1,
                    new Dictionary<string, string> { ["series_id"] = ind.SeriesId, ["error_type"] = "processing_error" });
            }
        }

        await _metrics.IncrementCounterAsync("fred_fetch_operations_total", 1,
            new Dictionary<string, string> { ["status"] = "completed" });

        _logger.LogInformation("FRED fetch completed: {Success} success, {Errors} errors", successCount, errorCount);
        return (successCount, errorCount);
    }

    public async Task FetchSingleIndicatorAsync(string seriesId, CancellationToken cancellationToken = default)
    {
        var indicator = await _repository.GetIndicatorBySeriesIdAsync(seriesId);
        if (indicator == null)
            throw new KeyNotFoundException($"Indicator {seriesId} not found");

        var obs = await _apiClient.GetLatestObservationAsync(indicator.SeriesId, cancellationToken);
        if (obs == null)
            throw new InvalidOperationException($"No observation available for {seriesId}");

        await _repository.UpsertIndicatorAsync(indicator.SeriesId, obs.Value, obs.Date);
    }
}
