using System.Diagnostics;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Scheduling;

/// <summary>
/// Service that combines Alpha Vantage (upcoming earnings) and Finnhub (historical actuals)
/// to provide complete earnings data for stock tickers.
/// </summary>
public class EarningsSyncService : IEarningsSyncService
{
    private readonly IAlphaVantageApiClient _alphaVantageClient;
    private readonly IFinnhubApiClient _finnhubClient;
    private readonly IEarningsRepository _earningsRepo;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<EarningsSyncService> _logger;

    private const string MetricsPrefix = "data_fetcher_2_earnings_sync";
    private const int RateLimitDelayMs = 15000; // 15 seconds between tickers (AV limit: 5/min)
    private const int KeepQuarters = 4;

    public EarningsSyncService(
        IAlphaVantageApiClient alphaVantageClient,
        IFinnhubApiClient finnhubClient,
        IEarningsRepository earningsRepo,
        IStockTickerRepository tickerRepo,
        IMetricsClient metrics,
        ILogger<EarningsSyncService> logger)
    {
        _alphaVantageClient = alphaVantageClient;
        _finnhubClient = finnhubClient;
        _earningsRepo = earningsRepo;
        _tickerRepo = tickerRepo;
        _metrics = metrics;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<EarningsSyncResult> SyncAllTickersAsync(CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new EarningsSyncResult();

        try
        {
            _logger.LogInformation("Starting earnings sync for all tickers (AV + Finnhub)");

            var tickers = await _tickerRepo.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalTickers = tickerList.Count;

            _logger.LogInformation("Found {Count} active tickers to sync", tickerList.Count);

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Earnings sync cancelled");
                    break;
                }

                try
                {
                    var count = await SyncTickerInternalAsync(ticker.Id, ticker.Symbol, cancellationToken);
                    result.RecordsUpserted += count;
                    result.SuccessCount++;

                    _logger.LogDebug("Synced {Count} earnings records for {Symbol}", count, ticker.Symbol);

                    // Rate limiting - wait between tickers to avoid API limits
                    await Task.Delay(RateLimitDelayMs, cancellationToken);
                }
                catch (Exception ex)
                {
                    result.ErrorCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Error syncing earnings for {Symbol}", ticker.Symbol);

                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_errors_total", 1,
                        new Dictionary<string, string> { ["symbol"] = ticker.Symbol });

                    // Continue with next ticker even on error
                }
            }

            stopwatch.Stop();
            result.Duration = stopwatch.Elapsed;

            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_records_synced_total", result.RecordsUpserted);
            await _metrics.SetGaugeAsync($"{MetricsPrefix}_last_sync_duration_seconds", result.Duration.TotalSeconds);

            _logger.LogInformation(
                "Completed earnings sync: {Records} records for {Success}/{Total} tickers, {Errors} errors, Duration: {Duration:F1}s",
                result.RecordsUpserted, result.SuccessCount, result.TotalTickers, result.ErrorCount, result.Duration.TotalSeconds);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error during earnings sync");
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fatal_errors_total", 1);
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<int> SyncTickerAsync(string symbol, CancellationToken cancellationToken = default)
    {
        var tickers = await _tickerRepo.GetActiveTickersAsync();
        var ticker = tickers.FirstOrDefault(t =>
            t.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));

        if (ticker == null)
        {
            _logger.LogWarning("Ticker {Symbol} not found in database", symbol);
            return 0;
        }

        return await SyncTickerInternalAsync(ticker.Id, ticker.Symbol, cancellationToken);
    }

    /// <summary>
    /// Syncs earnings data for a single ticker by combining AV and Finnhub data.
    /// </summary>
    private async Task<int> SyncTickerInternalAsync(int tickerId, string symbol, CancellationToken cancellationToken)
    {
        var count = 0;

        // Step 1: Fetch upcoming earnings from Alpha Vantage (future dates + estimate)
        _logger.LogDebug("Fetching Alpha Vantage earnings calendar for {Symbol}", symbol);
        var avItems = await _alphaVantageClient.GetEarningsCalendarAsync(symbol, cancellationToken);

        foreach (var item in avItems)
        {
            var fiscalYear = item.FiscalDateEnding.Year;
            var fiscalQuarter = GetFiscalQuarter(item.FiscalDateEnding.Month);

            var record = new EarningsReleaseSchedule
            {
                StockTickerId = tickerId,
                EarningsDate = item.ReportDate,
                FiscalYear = fiscalYear,
                FiscalQuarter = fiscalQuarter,
                EpsEstimate = item.Estimate
            };

            await _earningsRepo.UpsertAsync(record);
            count++;
        }

        // Step 2: Fetch historical earnings from Finnhub (actuals for past quarters)
        _logger.LogDebug("Fetching Finnhub earnings history for {Symbol}", symbol);
        var fhEarnings = await _finnhubClient.GetStockEarningsAsync(symbol, cancellationToken);

        if (fhEarnings != null)
        {
            // Take only the most recent quarters (configurable)
            var recentEarnings = fhEarnings.Take(KeepQuarters);

            foreach (var earning in recentEarnings)
            {
                var fiscalQuarter = $"Q{earning.Quarter}";

                var record = new EarningsReleaseSchedule
                {
                    StockTickerId = tickerId,
                    EarningsDate = DateOnly.MinValue, // Finnhub doesn't provide report date, will be preserved if exists
                    FiscalYear = earning.Year,
                    FiscalQuarter = fiscalQuarter,
                    EpsEstimate = earning.EpsEstimate,
                    EpsActual = earning.EpsActual,
                    EpsSurprise = earning.Surprise,
                    EpsSurprisePercent = earning.SurprisePercent
                };

                await _earningsRepo.UpsertAsync(record);
                count++;
            }
        }

        return count;
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
