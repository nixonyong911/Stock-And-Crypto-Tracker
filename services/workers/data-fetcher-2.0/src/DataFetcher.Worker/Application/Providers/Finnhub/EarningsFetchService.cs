using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

/// <summary>
/// Service implementation for fetching and processing earnings calendar data from Finnhub.
/// </summary>
public class EarningsFetchService : IEarningsFetchService
{
    private readonly IFinnhubApiClient _finnhubClient;
    private readonly IEarningsRepository _earningsRepo;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<EarningsFetchService> _logger;
    private const string MetricsPrefix = "data_fetcher_2_finnhub";

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

            var tickers = await _tickerRepo.GetActiveTickersAsync();
            _logger.LogInformation("Found {Count} active tickers to sync earnings for", tickers.Count());

            var count = 0;
            foreach (var ticker in tickers)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
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

                        var fiscalYear = event_.Year ?? earningsDate.Year;
                        var fiscalQuarter = event_.Quarter != null ? $"Q{event_.Quarter}" : GetQuarterFromDate(earningsDate);
                        var isFuture = earningsDate > DateOnly.FromDateTime(DateTime.UtcNow);

                        var schedule = new EarningsReleaseSchedule
                        {
                            StockTickerId = ticker.Id,
                            EarningsDate = earningsDate,
                            FiscalYear = fiscalYear,
                            FiscalQuarter = fiscalQuarter,
                            EpsEstimate = event_.EpsEstimate,
                            RevenueEstimate = event_.RevenueEstimate,
                            EpsActual = isFuture ? null : event_.EpsActual,
                            RevenueActual = isFuture ? null : event_.RevenueActual,
                            EpsSurprise = isFuture ? null : (event_.EpsActual - event_.EpsEstimate),
                            EpsSurprisePercent = isFuture || event_.EpsEstimate == null || event_.EpsEstimate == 0
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

            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_earnings_synced_total", count);
            _logger.LogInformation("Synced {Count} total earnings events for {TickerCount} tickers", count, tickers.Count());

            return count;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing earnings calendar");
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
                new Dictionary<string, string> { ["operation"] = "earnings_sync", ["error_type"] = ex.GetType().Name });
            throw;
        }
    }

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
