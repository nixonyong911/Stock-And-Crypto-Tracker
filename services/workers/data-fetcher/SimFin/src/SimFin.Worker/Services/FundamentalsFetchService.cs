using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;
using SimFin.Worker.Configuration;
using SimFin.Worker.Models;
using SimFin.Worker.Repositories;

namespace SimFin.Worker.Services;

public class FundamentalsFetchService : IFundamentalsFetchService
{
    private readonly ISimFinClient _simFinClient;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IFundamentalsRepository _fundamentalsRepository;
    private readonly IMetricsClient _metricsClient;
    private readonly SimFinSettings _settings;
    private readonly ILogger<FundamentalsFetchService> _logger;

    public FundamentalsFetchService(
        ISimFinClient simFinClient,
        IStockTickerRepository tickerRepository,
        IFundamentalsRepository fundamentalsRepository,
        IMetricsClient metricsClient,
        IOptions<SimFinSettings> settings,
        ILogger<FundamentalsFetchService> logger)
    {
        _simFinClient = simFinClient;
        _tickerRepository = tickerRepository;
        _fundamentalsRepository = fundamentalsRepository;
        _metricsClient = metricsClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<int> FetchAllFundamentalsAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting fundamentals fetch for all active tickers from SimFin");
        var startTime = DateTime.UtcNow;
        var successCount = 0;
        var errorCount = 0;

        try
        {
            var tickers = await _tickerRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();

            _logger.LogInformation("Found {Count} active tickers to process", tickerList.Count);

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Fetch cancelled after {Success} successes, {Errors} errors", successCount, errorCount);
                    break;
                }

                try
                {
                    var success = await FetchFundamentalsForTickerAsync(ticker, cancellationToken);
                    if (success)
                    {
                        successCount++;
                    }
                    else
                    {
                        errorCount++;
                    }

                    // Delay between requests to avoid rate limiting
                    if (_settings.DelayBetweenRequestsMs > 0)
                    {
                        await Task.Delay(_settings.DelayBetweenRequestsMs, cancellationToken);
                    }
                }
                catch (Exception ex)
                {
                    errorCount++;
                    _logger.LogError(ex, "Error processing ticker {Symbol}", ticker.Symbol);

                    // Record error metric
                    await _metricsClient.IncrementCounterAsync("fetch_errors_total", 1, new Dictionary<string, string>
                    {
                        ["error_type"] = ex.GetType().Name,
                        ["symbol"] = ticker.Symbol
                    });
                }
            }

            var duration = (DateTime.UtcNow - startTime).TotalSeconds;
            _logger.LogInformation(
                "Fundamentals fetch completed: {Success} successes, {Errors} errors in {Duration:F2}s",
                successCount, errorCount, duration);

            // Record metrics
            await _metricsClient.IncrementCounterAsync("fetch_operations_total", 1, new Dictionary<string, string>
            {
                ["status"] = errorCount == 0 ? "success" : "partial"
            });
            await _metricsClient.IncrementCounterAsync("records_upserted_total", successCount);
            await _metricsClient.ObserveHistogramAsync("fetch_duration_seconds", duration);

            return successCount;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error during fundamentals fetch");
            await _metricsClient.IncrementCounterAsync("fetch_errors_total", 1, new Dictionary<string, string>
            {
                ["error_type"] = "fatal"
            });
            throw;
        }
    }

    public async Task<bool> FetchFundamentalsForTickerAsync(StockTicker ticker, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogDebug("Fetching fundamentals for {Symbol} (ID: {Id}) from SimFin", ticker.Symbol, ticker.Id);

            // Fetch fundamentals from SimFin
            var fundamentals = await _simFinClient.GetFundamentalsAsync(ticker.Symbol, ticker.Id, cancellationToken);
            if (fundamentals != null)
            {
                await _fundamentalsRepository.UpsertFundamentalsAsync(fundamentals);
                _logger.LogDebug("Upserted fundamentals for {Symbol}", ticker.Symbol);
                return true;
            }

            _logger.LogWarning("No fundamentals data returned for {Symbol}", ticker.Symbol);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch fundamentals for {Symbol}", ticker.Symbol);
            return false;
        }
    }
}
