using System.Diagnostics;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Main service for orchestrating candlestick analysis.
/// </summary>
public class CandlestickAnalysisService : ICandlestickAnalysisService
{
    private static readonly TimeZoneInfo EasternTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

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

    public async Task<BatchAnalysisResult> AnalyzeDevelopingStocksAsync(DateOnly today, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new BatchAnalysisResult { AnalysisDate = today };

        var nowEt = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz);
        var marketOpenMinutes = (nowEt.Hour * 60 + nowEt.Minute) - (9 * 60 + 30);
        var confidence = Math.Clamp(marketOpenMinutes / 390.0m, 0m, 1m);

        if (confidence <= 0.5m)
        {
            _logger.LogInformation("Skipping developing analysis — confidence {Confidence:F2} <= 0.50 (market time insufficient)", confidence);
            result.Success = true;
            return result;
        }

        _logger.LogInformation("Running developing stock analysis for {Date} with confidence {Confidence:F2}", today, confidence);

        try
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalStocks = tickerList.Count;

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var prices = await _stockPriceRepository.GetPricesForDateAsync(ticker.Id, today);
                    var priceList = prices.ToList();
                    if (priceList.Count == 0) { result.SuccessCount++; continue; }

                    var dailyCandle = _aggregationService.AggregateToDailyCandle(priceList, ticker.Id, ticker.Symbol, today);
                    if (dailyCandle == null) { result.SuccessCount++; continue; }

                    dailyCandle.Timeframe = "daily";
                    dailyCandle.IsConfirmed = false;
                    dailyCandle.Confidence = confidence;

                    var patterns = _patternDetectionService.DetectPatterns(dailyCandle);
                    var analysisResult = AnalysisResult.FromCandle(dailyCandle, patterns);

                    await _analysisRepository.UpsertAnalysisAsync(analysisResult);
                    result.Results.Add(analysisResult);
                    result.SuccessCount++;
                    result.PatternsDetected += patterns.Count;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed developing analysis for {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            _logger.LogInformation(
                "Developing stock analysis completed for {Date}: {Success}/{Total}, {Patterns} patterns, confidence={Confidence:F2}, {Duration:F2}s",
                today, result.SuccessCount, result.TotalStocks, result.PatternsDetected, confidence, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Developing batch failed: {ex.Message}");
            _logger.LogError(ex, "Developing stock analysis failed for {Date}", today);
            throw;
        }
    }

    public async Task<BatchAnalysisResult> AnalyzeWeeklyStocksAsync(DateOnly weekEndDate, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new BatchAnalysisResult { AnalysisDate = weekEndDate };

        var dayOfWeek = weekEndDate.DayOfWeek;
        if (dayOfWeek != DayOfWeek.Friday && dayOfWeek != DayOfWeek.Saturday)
        {
            _logger.LogInformation("Skipping weekly stock analysis — today is {Day}, not Friday/Saturday", dayOfWeek);
            result.Success = true;
            return result;
        }

        var friday = dayOfWeek == DayOfWeek.Friday ? weekEndDate : weekEndDate.AddDays(-1);
        var monday = friday.AddDays(-4);

        _logger.LogInformation("Running weekly stock analysis for week {Monday} to {Friday}", monday, friday);

        try
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalStocks = tickerList.Count;

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var allPrices = new List<StockPrice>();
                    for (var d = monday; d <= friday; d = d.AddDays(1))
                    {
                        var dayPrices = await _stockPriceRepository.GetPricesForDateAsync(ticker.Id, d);
                        allPrices.AddRange(dayPrices);
                    }

                    if (allPrices.Count == 0) { result.SuccessCount++; continue; }

                    var weeklyCandle = _aggregationService.AggregateToDailyCandle(allPrices, ticker.Id, ticker.Symbol, friday);
                    if (weeklyCandle == null) { result.SuccessCount++; continue; }

                    weeklyCandle.Timeframe = "weekly";
                    weeklyCandle.IsConfirmed = true;
                    weeklyCandle.Confidence = 1.0m;

                    var patterns = _patternDetectionService.DetectPatterns(weeklyCandle);
                    var analysisResult = AnalysisResult.FromCandle(weeklyCandle, patterns);

                    await _analysisRepository.UpsertAnalysisAsync(analysisResult);
                    result.Results.Add(analysisResult);
                    result.SuccessCount++;
                    result.PatternsDetected += patterns.Count;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed weekly analysis for {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            _logger.LogInformation(
                "Weekly stock analysis completed for {Date}: {Success}/{Total}, {Patterns} patterns, {Duration:F2}s",
                friday, result.SuccessCount, result.TotalStocks, result.PatternsDetected, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Weekly batch failed: {ex.Message}");
            _logger.LogError(ex, "Weekly stock analysis failed for {Date}", weekEndDate);
            throw;
        }
    }
}
