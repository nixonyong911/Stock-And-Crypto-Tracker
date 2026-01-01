using System.Diagnostics;
using Microsoft.Extensions.Logging;
using StockTracker.Common.Metrics;
using CandlestickAnalysis.Worker.Models;
using CandlestickAnalysis.Worker.Repositories;

namespace CandlestickAnalysis.Worker.Services;

/// <summary>
/// Main service for orchestrating candlestick analysis.
/// </summary>
public class CandlestickAnalysisService : ICandlestickAnalysisService
{
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly IAnalysisRepository _analysisRepository;
    private readonly IDailyAggregationService _aggregationService;
    private readonly IPatternDetectionService _patternDetectionService;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<CandlestickAnalysisService> _logger;

    public CandlestickAnalysisService(
        IStockPriceRepository stockPriceRepository,
        IAnalysisRepository analysisRepository,
        IDailyAggregationService aggregationService,
        IPatternDetectionService patternDetectionService,
        IMetricsClient metrics,
        ILogger<CandlestickAnalysisService> logger)
    {
        _stockPriceRepository = stockPriceRepository;
        _analysisRepository = analysisRepository;
        _aggregationService = aggregationService;
        _patternDetectionService = patternDetectionService;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<AnalysisResult?> AnalyzeStockAsync(int stockTickerId, string symbol, DateOnly date, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Analyzing {Symbol} for {Date}", symbol, date);

            // 1. Get 15-minute candles for the date
            var prices = await _stockPriceRepository.GetPricesForDateAsync(stockTickerId, date);
            var priceList = prices.ToList();

            if (priceList.Count == 0)
            {
                _logger.LogWarning("No price data found for {Symbol} on {Date}", symbol, date);
                return null;
            }

            // 2. Aggregate to daily candle
            var dailyCandle = _aggregationService.AggregateToDailyCandle(priceList, stockTickerId, symbol, date);
            if (dailyCandle == null)
            {
                return null;
            }

            // 3. Detect patterns
            var patterns = _patternDetectionService.DetectPatterns(dailyCandle);

            // 4. Create result
            var result = AnalysisResult.FromCandle(dailyCandle, patterns);

            // 5. Save to database
            await _analysisRepository.UpsertAnalysisAsync(result);

            // 6. Record metrics
            await _metrics.IncrementCounterAsync("analysis_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["status"] = "success"
                });

            foreach (var pattern in patterns)
            {
                await _metrics.IncrementCounterAsync("patterns_detected_total", 1,
                    new Dictionary<string, string>
                    {
                        ["pattern_type"] = pattern.Pattern,
                        ["signal"] = pattern.Signal
                    });
            }

            _logger.LogInformation(
                "Analyzed {Symbol} for {Date}: {CandleCount} candles aggregated, {PatternCount} patterns detected",
                symbol, date, priceList.Count, patterns.Count);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing {Symbol} for {Date}", symbol, date);

            await _metrics.IncrementCounterAsync("analysis_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["status"] = "failed"
                });

            throw;
        }
    }

    public async Task<BatchAnalysisResult> AnalyzeAllStocksAsync(DateOnly date, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new BatchAnalysisResult
        {
            AnalysisDate = date
        };

        try
        {
            // Get all active tickers
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalStocks = tickerList.Count;

            _logger.LogInformation("Starting batch analysis for {Date} - {Count} stocks", date, tickerList.Count);

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Batch analysis cancelled");
                    break;
                }

                try
                {
                    var analysisResult = await AnalyzeStockAsync(ticker.Id, ticker.Symbol, date, cancellationToken);
                    if (analysisResult != null)
                    {
                        result.Results.Add(analysisResult);
                        result.SuccessCount++;
                        result.PatternsDetected += analysisResult.DetectedPatterns.Count;
                    }
                    else
                    {
                        // No data for this stock on this date (not necessarily an error)
                        result.SuccessCount++;
                    }
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed to analyze {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            // Record batch metrics
            await _metrics.ObserveHistogramAsync("analysis_duration_seconds", result.DurationSeconds);
            await _metrics.IncrementCounterAsync("stocks_analyzed_total", result.SuccessCount);

            _logger.LogInformation(
                "Batch analysis completed for {Date}: {Success}/{Total} stocks, {Patterns} patterns, {Duration:F2}s",
                date, result.SuccessCount, result.TotalStocks, result.PatternsDetected, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Batch analysis failed: {ex.Message}");

            _logger.LogError(ex, "Batch analysis failed for {Date}", date);
            throw;
        }
    }
}

