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
            _logger.LogInformation("Syncing earnings calendar for all tracked tickers");

            // Get all tracked tickers
            var tickers = await _tickerRepo.GetActiveTickersAsync();
            _logger.LogInformation("Found {Count} active tickers to sync earnings for", tickers.Count());

            var count = 0;
            foreach (var ticker in tickers)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    // Fetch earnings for this specific symbol (returns up to 4 quarters of data)
                    var calendar = await _finnhubClient.GetEarningsCalendarBySymbolAsync(ticker.Symbol, cancellationToken);
                    
                    if (calendar?.EarningsCalendarData == null || !calendar.EarningsCalendarData.Any())
                    {
                        _logger.LogDebug("No earnings data for {Symbol}", ticker.Symbol);
                        continue;
                    }

                    foreach (var event_ in calendar.EarningsCalendarData)
                    {
                        if (string.IsNullOrEmpty(event_.Date))
                            continue;

                        if (!DateOnly.TryParse(event_.Date, out var earningsDate))
                        {
                            _logger.LogWarning("Could not parse earnings date {Date} for {Symbol}", event_.Date, ticker.Symbol);
                            continue;
                        }

                        // Extract fiscal year and quarter from API response
                        var fiscalYear = event_.Year ?? earningsDate.Year;
                        var fiscalQuarter = event_.Quarter != null ? $"Q{event_.Quarter}" : GetQuarterFromDate(earningsDate);

                        var isEstimate = earningsDate > DateOnly.FromDateTime(DateTime.UtcNow);

                        var schedule = new EarningsReleaseSchedule
                        {
                            StockTickerId = ticker.Id,
                            EarningsDate = earningsDate,
                            FiscalYear = fiscalYear,
                            FiscalQuarter = fiscalQuarter,
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

                    _logger.LogDebug("Synced {EventCount} earnings events for {Symbol}", 
                        calendar.EarningsCalendarData.Count, ticker.Symbol);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error syncing earnings for {Symbol}", ticker.Symbol);
                }
            }

            await _metrics.IncrementCounterAsync("earnings_synced_total", count);
            _logger.LogInformation("Synced {Count} total earnings events for {TickerCount} tickers", count, tickers.Count());

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

    /// <summary>
    /// Determines fiscal quarter from earnings date.
    /// </summary>
    private static string GetQuarterFromDate(DateOnly date)
    {
        return date.Month switch
        {
            >= 1 and <= 3 => "Q1",
            >= 4 and <= 6 => "Q2",
            >= 7 and <= 9 => "Q3",
            _ => "Q4"
        };
    }
}
