using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;
using CandlestickAnalysis.Worker.Configuration;
using CandlestickAnalysis.Worker.Models;
using CandlestickAnalysis.Worker.Repositories;

namespace CandlestickAnalysis.Worker.Services;

/// <summary>
/// Service for executing historical candlestick analysis backfill operations.
/// Analyzes dates with price data that haven't been analyzed yet.
/// </summary>
public class AnalysisBackfillService : IAnalysisBackfillService
{
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly IAnalysisRepository _analysisRepository;
    private readonly ICandlestickAnalysisService _analysisService;
    private readonly AnalysisBackfillSettings _settings;
    private readonly ILogger<AnalysisBackfillService> _logger;
    private readonly IMetricsClient _metrics;

    public AnalysisBackfillService(
        IStockPriceRepository stockPriceRepository,
        IAnalysisRepository analysisRepository,
        ICandlestickAnalysisService analysisService,
        IOptions<AnalysisBackfillSettings> settings,
        ILogger<AnalysisBackfillService> logger,
        IMetricsClient metrics)
    {
        _stockPriceRepository = stockPriceRepository;
        _analysisRepository = analysisRepository;
        _analysisService = analysisService;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new AnalysisBackfillResult
        {
            Symbol = request.Symbol
        };

        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation(
            "Starting analysis backfill for {Symbol} - Days to backfill: {Days}",
            request.Symbol,
            request.DaysToBackfill ?? _settings.DaysToBackfill);

        try
        {
            // Get the ticker
            var ticker = await GetTickerAsync(request);
            if (ticker == null)
            {
                throw new InvalidOperationException($"Ticker not found for symbol '{request.Symbol}'");
            }

            _logger.LogInformation("Found ticker {Symbol} (ID: {Id})", ticker.Symbol, ticker.Id);

            // Calculate date range
            var daysToBackfill = request.DaysToBackfill ?? _settings.DaysToBackfill;
            var endDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)); // Yesterday
            var startDate = endDate.AddDays(-daysToBackfill);

            // Get dates with price data
            var priceDates = (await _stockPriceRepository.GetDistinctPriceDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();

            if (priceDates.Count == 0)
            {
                _logger.LogWarning("No price data found for {Symbol} in date range {Start} to {End}",
                    request.Symbol, startDate, endDate);

                result.Success = true;
                result.Duration = stopwatch.Elapsed;
                return result;
            }

            // Get dates already analyzed
            var analyzedDates = (await _analysisRepository.GetAnalyzedDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();

            // Calculate dates to process (price data exists but not yet analyzed)
            var datesToProcess = priceDates.Except(analyzedDates).OrderBy(d => d).ToList();

            result.DatesSkipped = analyzedDates.Count;

            _logger.LogInformation(
                "Backfill plan for {Symbol}: {ToProcess} dates to analyze, {Skipped} already analyzed, {Total} total with data",
                request.Symbol, datesToProcess.Count, result.DatesSkipped, priceDates.Count);

            if (datesToProcess.Count == 0)
            {
                _logger.LogInformation("All dates already analyzed for {Symbol}", request.Symbol);
                result.Success = true;
                result.Duration = stopwatch.Elapsed;
                return result;
            }

            // Process dates in batches
            var totalPatternsDetected = 0;
            var processedCount = 0;
            var batchNumber = 0;

            foreach (var batch in datesToProcess.Chunk(_settings.BatchSizeDays))
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Backfill cancelled for {Symbol} after {Processed} dates",
                        request.Symbol, processedCount);
                    break;
                }

                batchNumber++;
                _logger.LogInformation(
                    "Processing batch {Batch} for {Symbol}: {Count} dates ({Start} to {End})",
                    batchNumber, request.Symbol, batch.Length, batch.First(), batch.Last());

                foreach (var date in batch)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    try
                    {
                        var analysisResult = await _analysisService.AnalyzeStockAsync(
                            ticker.Id, ticker.Symbol, date, cancellationToken);

                        if (analysisResult != null)
                        {
                            totalPatternsDetected += analysisResult.DetectedPatterns.Count;
                        }

                        processedCount++;

                        // Small delay to prevent CPU overload
                        if (_settings.DelayBetweenDatesMs > 0)
                        {
                            await Task.Delay(_settings.DelayBetweenDatesMs, cancellationToken);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error analyzing {Symbol} for {Date}", request.Symbol, date);
                        // Continue with next date, don't fail the entire backfill
                    }
                }

                _logger.LogInformation(
                    "Batch {Batch} complete for {Symbol}: {Processed}/{Total} dates processed",
                    batchNumber, request.Symbol, processedCount, datesToProcess.Count);

                // Delay between batches
                if (_settings.DelayBetweenBatchesMs > 0 && !cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(_settings.DelayBetweenBatchesMs, cancellationToken);
                }
            }

            stopwatch.Stop();

            result.Success = true;
            result.DatesAnalyzed = processedCount;
            result.PatternsDetected = totalPatternsDetected;
            result.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Backfill completed for {Symbol}: {Dates} dates analyzed, {Patterns} patterns detected, Duration: {Duration:F1}s",
                request.Symbol, result.DatesAnalyzed, result.PatternsDetected, result.Duration.TotalSeconds);

            // Record success metrics
            await _metrics.IncrementCounterAsync("analysis_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["status"] = "success"
                });

            await _metrics.IncrementCounterAsync("analysis_backfill_dates_total", result.DatesAnalyzed,
                new Dictionary<string, string> { ["symbol"] = request.Symbol });

            await _metrics.ObserveHistogramAsync("analysis_backfill_duration_seconds",
                result.Duration.TotalSeconds,
                new Dictionary<string, string> { ["symbol"] = request.Symbol });
        }
        catch (Exception ex)
        {
            stopwatch.Stop();

            result.Success = false;
            result.Error = ex.Message;
            result.Duration = stopwatch.Elapsed;

            _logger.LogError(ex, "Backfill failed for {Symbol} after {Duration:F1}s",
                request.Symbol, result.Duration.TotalSeconds);

            // Record error metrics
            await _metrics.IncrementCounterAsync("analysis_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["status"] = "error"
                });

            await _metrics.IncrementCounterAsync("analysis_backfill_errors_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["error_type"] = ex.GetType().Name
                });
        }

        return result;
    }

    private async Task<StockTicker?> GetTickerAsync(AnalysisBackfillRequest request)
    {
        // If ticker ID is provided, get ticker by ID from active tickers
        if (request.TickerId.HasValue)
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            return tickers.FirstOrDefault(t => t.Id == request.TickerId.Value);
        }

        // Otherwise, get by symbol
        return await _stockPriceRepository.GetTickerBySymbolAsync(request.Symbol);
    }
}
