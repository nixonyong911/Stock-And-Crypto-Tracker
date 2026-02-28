using System.Diagnostics;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public class PriceTargetBackfillService : IPriceTargetBackfillService
{
    private readonly IPriceTargetService _priceTargetService;
    private readonly IPriceTargetRepository _priceTargetRepository;
    private readonly IAnalysisRepository _analysisRepository;
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly ILogger<PriceTargetBackfillService> _logger;
    private readonly IMetricsClient _metrics;

    public PriceTargetBackfillService(
        IPriceTargetService priceTargetService,
        IPriceTargetRepository priceTargetRepository,
        IAnalysisRepository analysisRepository,
        IStockPriceRepository stockPriceRepository,
        ILogger<PriceTargetBackfillService> logger,
        IMetricsClient metrics)
    {
        _priceTargetService = priceTargetService;
        _priceTargetRepository = priceTargetRepository;
        _analysisRepository = analysisRepository;
        _stockPriceRepository = stockPriceRepository;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<BackfillResult> BackfillAsync(int stockTickerId, string symbol, int days = 90, CancellationToken ct = default)
    {
        var result = new BackfillResult();
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Starting price target backfill for {Symbol} (ID: {Id}) - {Days} days",
            symbol, stockTickerId, days);

        try
        {
            var endDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
            var startDate = endDate.AddDays(-days);

            var analyzedDates = (await _analysisRepository.GetAnalyzedDatesAsync(stockTickerId, startDate, endDate)).ToHashSet();
            var computedDates = (await _priceTargetRepository.GetComputedDatesAsync(symbol, startDate, endDate)).ToHashSet();

            var missingDates = analyzedDates.Except(computedDates).OrderBy(d => d).ToList();

            result.TotalDates = analyzedDates.Count;
            result.Skipped = computedDates.Count;

            _logger.LogInformation(
                "Backfill plan for {Symbol}: {Missing} dates to compute, {Skipped} already computed, {Total} total with candlestick data",
                symbol, missingDates.Count, result.Skipped, result.TotalDates);

            if (missingDates.Count == 0)
            {
                _logger.LogInformation("All dates already computed for {Symbol}", symbol);
                result.Duration = stopwatch.Elapsed;
                return result;
            }

            foreach (var date in missingDates)
            {
                if (ct.IsCancellationRequested)
                {
                    _logger.LogWarning("Backfill cancelled for {Symbol} after {Computed} dates", symbol, result.Computed);
                    break;
                }

                try
                {
                    await _priceTargetService.CalculateForStockAsync(stockTickerId, symbol, date, ct);
                    result.Computed++;
                }
                catch (Exception ex)
                {
                    result.Failed++;
                    result.Errors.Add($"{symbol}/{date}: {ex.Message}");
                    _logger.LogError(ex, "Error computing price target for {Symbol} on {Date}", symbol, date);
                }

                await Task.Delay(50, ct);
            }

            stopwatch.Stop();
            result.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Backfill completed for {Symbol}: {Computed} computed, {Skipped} skipped, {Failed} failed, Duration: {Duration:F1}s",
                symbol, result.Computed, result.Skipped, result.Failed, result.Duration.TotalSeconds);

            await _metrics.IncrementCounterAsync("price_target_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["status"] = result.Failed == 0 ? "success" : "partial"
                });

            await _metrics.IncrementCounterAsync("price_target_backfill_dates_total", result.Computed,
                new Dictionary<string, string> { ["symbol"] = symbol });

            await _metrics.ObserveHistogramAsync("price_target_backfill_duration_seconds",
                result.Duration.TotalSeconds,
                new Dictionary<string, string> { ["symbol"] = symbol });
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.Duration = stopwatch.Elapsed;
            result.Errors.Add(ex.Message);

            _logger.LogError(ex, "Backfill failed for {Symbol} after {Duration:F1}s",
                symbol, result.Duration.TotalSeconds);

            await _metrics.IncrementCounterAsync("price_target_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["status"] = "error"
                });
        }

        return result;
    }

    public async Task<BackfillResult> BackfillAllAsync(int days = 90, CancellationToken ct = default)
    {
        var aggregated = new BackfillResult();
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Starting price target backfill for all active tickers - {Days} days", days);

        try
        {
            var tickers = (await _stockPriceRepository.GetActiveTickersAsync()).ToList();
            _logger.LogInformation("Found {Count} active tickers for backfill", tickers.Count);

            foreach (var ticker in tickers)
            {
                if (ct.IsCancellationRequested)
                {
                    _logger.LogWarning("BackfillAll cancelled after processing some tickers");
                    break;
                }

                try
                {
                    var tickerResult = await BackfillAsync(ticker.Id, ticker.Symbol, days, ct);
                    aggregated.TotalDates += tickerResult.TotalDates;
                    aggregated.Computed += tickerResult.Computed;
                    aggregated.Skipped += tickerResult.Skipped;
                    aggregated.Failed += tickerResult.Failed;
                    aggregated.Errors.AddRange(tickerResult.Errors);
                }
                catch (Exception ex)
                {
                    aggregated.Failed++;
                    aggregated.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "BackfillAll error for ticker {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            aggregated.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "BackfillAll completed: {Computed} computed, {Skipped} skipped, {Failed} failed across {TickerCount} tickers, Duration: {Duration:F1}s",
                aggregated.Computed, aggregated.Skipped, aggregated.Failed, tickers.Count, aggregated.Duration.TotalSeconds);

            await _metrics.ObserveHistogramAsync("price_target_backfill_all_duration_seconds",
                aggregated.Duration.TotalSeconds);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            aggregated.Duration = stopwatch.Elapsed;
            aggregated.Errors.Add($"BackfillAll failed: {ex.Message}");

            _logger.LogError(ex, "BackfillAll failed after {Duration:F1}s", aggregated.Duration.TotalSeconds);
        }

        return aggregated;
    }
}
