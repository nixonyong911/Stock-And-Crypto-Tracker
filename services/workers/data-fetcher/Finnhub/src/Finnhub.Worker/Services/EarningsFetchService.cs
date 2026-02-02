using Finnhub.Worker.Domain.Models;
using Finnhub.Worker.Repositories;
using StockTracker.Common.Metrics;

namespace Finnhub.Worker.Services;

/// <summary>
/// Service implementation for fetching and processing earnings calendar data.
/// </summary>
public class EarningsFetchService : IEarningsFetchService
{
    private readonly IFinnhubApiClient _finnhubClient;
    private readonly IEarningsRepository _earningsRepo;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<EarningsFetchService> _logger;

    public EarningsFetchService(
        IFinnhubApiClient finnhubClient,
        IEarningsRepository earningsRepo,
        IStockTickerRepository tickerRepo,
        IMetricsClient metrics,
        ILogger<EarningsFetchService> logger)
    {
        _finnhubClient = finnhubClient;
        _earningsRepo = earningsRepo;
        _tickerRepo = tickerRepo;
        _metrics = metrics;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> SyncEarningsCalendarAsync(int daysBack = 7, int daysForward = 30, CancellationToken cancellationToken = default)
    {
        try
        {
            var fromDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-daysBack));
            var toDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(daysForward));

            _logger.LogInformation("Syncing earnings calendar from {From} to {To}", fromDate, toDate);

            var calendar = await _finnhubClient.GetEarningsCalendarAsync(fromDate, toDate, cancellationToken);
            if (calendar?.EarningsCalendarData == null || !calendar.EarningsCalendarData.Any())
            {
                _logger.LogWarning("No earnings calendar data returned");
                return 0;
            }

            // Get our tracked tickers for filtering
            var tickers = await _tickerRepo.GetActiveTickersAsync();
            var tickerLookup = tickers.ToDictionary(t => t.Symbol, t => t.Id, StringComparer.OrdinalIgnoreCase);

            var count = 0;
            foreach (var event_ in calendar.EarningsCalendarData)
            {
                if (cancellationToken.IsCancellationRequested) break;

                if (string.IsNullOrEmpty(event_.Symbol) || string.IsNullOrEmpty(event_.Date))
                    continue;

                // Only process tickers we track
                if (!tickerLookup.TryGetValue(event_.Symbol, out var tickerId))
                    continue;

                try
                {
                    if (!DateOnly.TryParse(event_.Date, out var earningsDate))
                    {
                        _logger.LogWarning("Could not parse earnings date {Date} for {Symbol}", event_.Date, event_.Symbol);
                        continue;
                    }

                    var isEstimate = earningsDate > DateOnly.FromDateTime(DateTime.UtcNow);

                    var schedule = new EarningsReleaseSchedule
                    {
                        StockTickerId = tickerId,
                        EarningsDate = earningsDate,
                        IsEstimate = isEstimate,
                        EpsEstimate = event_.EpsEstimate,
                        RevenueEstimate = event_.RevenueEstimate,
                        EpsActual = isEstimate ? null : event_.EpsActual,
                        RevenueActual = isEstimate ? null : event_.RevenueActual,
                        EpsSurprise = isEstimate ? null : (event_.EpsActual - event_.EpsEstimate),
                        EpsSurprisePercent = isEstimate || event_.EpsEstimate == null || event_.EpsEstimate == 0
                            ? null
                            : ((event_.EpsActual - event_.EpsEstimate) / Math.Abs(event_.EpsEstimate.Value)) * 100
                    };

                    await _earningsRepo.UpsertAsync(schedule);
                    count++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing earnings event for {Symbol}", event_.Symbol);
                }
            }

            await _metrics.IncrementCounterAsync("earnings_synced_total", count);
            _logger.LogInformation("Synced {Count} earnings events for tracked tickers", count);

            return count;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing earnings calendar");
            await _metrics.IncrementCounterAsync("fetch_errors_total", 1,
                new Dictionary<string, string> { ["operation"] = "earnings_sync", ["error_type"] = ex.GetType().Name });
            throw;
        }
    }
}
