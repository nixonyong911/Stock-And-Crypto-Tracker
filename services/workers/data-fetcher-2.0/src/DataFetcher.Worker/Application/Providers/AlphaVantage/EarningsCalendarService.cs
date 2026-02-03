using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage;
using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage.Models;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.AlphaVantage;

/// <summary>
/// Service implementation for fetching and processing earnings calendar data from Alpha Vantage.
/// </summary>
public class EarningsCalendarService : IEarningsCalendarService
{
    private readonly IAlphaVantageApiClient _apiClient;
    private readonly IEarningsRepository _earningsRepo;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly AlphaVantageSettings _settings;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<EarningsCalendarService> _logger;
    private const string MetricsPrefix = "data_fetcher_2_alphavantage";

    public EarningsCalendarService(
        IAlphaVantageApiClient apiClient,
        IEarningsRepository earningsRepo,
        IStockTickerRepository tickerRepo,
        IOptions<AlphaVantageSettings> settings,
        IMetricsClient metrics,
        ILogger<EarningsCalendarService> logger)
    {
        _apiClient = apiClient;
        _earningsRepo = earningsRepo;
        _tickerRepo = tickerRepo;
        _settings = settings.Value;
        _metrics = metrics;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> SyncAllEarningsCalendarAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Starting earnings calendar sync for all tickers");

            var tickers = await _tickerRepo.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            _logger.LogInformation("Found {Count} active tickers to sync earnings for", tickerList.Count);

            var totalCount = 0;
            var successCount = 0;
            var errorCount = 0;

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var count = await SyncEarningsForTickerAsync(ticker.Id, ticker.Symbol, cancellationToken);
                    totalCount += count;
                    successCount++;

                    // Rate limiting - wait between requests
                    if (_settings.RateLimitDelayMs > 0)
                    {
                        await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);
                    }
                }
                catch (Exception ex)
                {
                    errorCount++;
                    _logger.LogError(ex, "Error syncing earnings for {Symbol}", ticker.Symbol);
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
                        new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["error_type"] = ex.GetType().Name });
                }
            }

            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_earnings_synced_total", totalCount);
            _logger.LogInformation(
                "Completed earnings calendar sync: {TotalCount} events for {SuccessCount}/{TotalTickers} tickers, {ErrorCount} errors",
                totalCount, successCount, tickerList.Count, errorCount);

            return totalCount;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during earnings calendar sync");
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
                new Dictionary<string, string> { ["operation"] = "sync_all", ["error_type"] = ex.GetType().Name });
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<int> SyncEarningsCalendarBySymbolAsync(string symbol, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Syncing earnings calendar for symbol {Symbol}", symbol);

            // Look up ticker ID from symbol
            var tickers = await _tickerRepo.GetActiveTickersAsync();
            var ticker = tickers.FirstOrDefault(t => 
                t.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));

            if (ticker == null)
            {
                _logger.LogWarning("Ticker {Symbol} not found in database", symbol);
                return 0;
            }

            var count = await SyncEarningsForTickerAsync(ticker.Id, ticker.Symbol, cancellationToken);

            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_earnings_synced_total", count,
                new Dictionary<string, string> { ["symbol"] = symbol });

            return count;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing earnings for {Symbol}", symbol);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["error_type"] = ex.GetType().Name });
            throw;
        }
    }

    /// <summary>
    /// Syncs earnings calendar for a single ticker.
    /// </summary>
    private async Task<int> SyncEarningsForTickerAsync(int tickerId, string symbol, CancellationToken cancellationToken)
    {
        var items = await _apiClient.GetEarningsCalendarAsync(symbol, cancellationToken);
        var itemList = items.ToList();

        if (itemList.Count == 0)
        {
            _logger.LogDebug("No earnings data for {Symbol}", symbol);
            return 0;
        }

        var count = 0;
        foreach (var item in itemList)
        {
            var schedule = MapToEarningsReleaseSchedule(tickerId, item);
            await _earningsRepo.UpsertAsync(schedule);
            count++;
        }

        _logger.LogDebug("Synced {Count} earnings events for {Symbol}", count, symbol);
        return count;
    }

    /// <summary>
    /// Maps Alpha Vantage earnings calendar item to database entity.
    /// </summary>
    private static EarningsReleaseSchedule MapToEarningsReleaseSchedule(int tickerId, EarningsCalendarItem item)
    {
        // Derive fiscal year and quarter from fiscal date ending
        var fiscalYear = item.FiscalDateEnding.Year;
        var fiscalQuarter = GetFiscalQuarter(item.FiscalDateEnding.Month);

        // Future dates are estimates
        var isEstimate = item.ReportDate > DateOnly.FromDateTime(DateTime.UtcNow);

        return new EarningsReleaseSchedule
        {
            StockTickerId = tickerId,
            EarningsDate = item.ReportDate,
            FiscalYear = fiscalYear,
            FiscalQuarter = fiscalQuarter,
            IsEstimate = isEstimate,
            EpsEstimate = item.Estimate,
            // Alpha Vantage doesn't provide revenue estimate or actuals
            RevenueEstimate = null,
            EpsActual = null,
            RevenueActual = null,
            EpsSurprise = null,
            EpsSurprisePercent = null
        };
    }

    /// <summary>
    /// Determines fiscal quarter from month.
    /// </summary>
    private static string GetFiscalQuarter(int month)
    {
        return month switch
        {
            >= 1 and <= 3 => "Q1",
            >= 4 and <= 6 => "Q2",
            >= 7 and <= 9 => "Q3",
            _ => "Q4"
        };
    }
}
