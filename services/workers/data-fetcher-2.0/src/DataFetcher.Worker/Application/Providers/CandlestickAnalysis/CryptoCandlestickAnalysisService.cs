using System.Diagnostics;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public class CryptoCandlestickAnalysisService : ICryptoCandlestickAnalysisService
{
    private readonly ICryptoPriceRepository _cryptoPriceRepository;
    private readonly ICryptoAnalysisRepository _cryptoAnalysisRepository;
    private readonly ICryptoDailyAggregationService _aggregationService;
    private readonly IPatternDetectionService _patternDetectionService;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<CryptoCandlestickAnalysisService> _logger;

    public CryptoCandlestickAnalysisService(
        ICryptoPriceRepository cryptoPriceRepository,
        ICryptoAnalysisRepository cryptoAnalysisRepository,
        ICryptoDailyAggregationService aggregationService,
        IPatternDetectionService patternDetectionService,
        IMetricsClient metrics,
        ILogger<CryptoCandlestickAnalysisService> logger)
    {
        _cryptoPriceRepository = cryptoPriceRepository;
        _cryptoAnalysisRepository = cryptoAnalysisRepository;
        _aggregationService = aggregationService;
        _patternDetectionService = patternDetectionService;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<CryptoAnalysisResult?> AnalyzeCryptoAsync(int cryptoTickerId, string symbol, DateOnly date, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Analyzing crypto {Symbol} for {Date}", symbol, date);

            var prices = await _cryptoPriceRepository.GetPricesForDateAsync(cryptoTickerId, date);
            var priceList = prices.ToList();

            if (priceList.Count == 0)
            {
                _logger.LogWarning("No crypto price data found for {Symbol} on {Date}", symbol, date);
                return null;
            }

            var dailyCandle = _aggregationService.AggregateToDailyCandle(priceList, cryptoTickerId, symbol, date);
            if (dailyCandle == null)
                return null;

            var patterns = _patternDetectionService.DetectPatterns(dailyCandle);
            var result = CryptoAnalysisResult.FromCandle(dailyCandle, patterns);

            await _cryptoAnalysisRepository.UpsertAnalysisAsync(result);

            await _metrics.IncrementCounterAsync("crypto_analysis_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "success" });

            foreach (var pattern in patterns)
            {
                await _metrics.IncrementCounterAsync("crypto_patterns_detected_total", 1,
                    new Dictionary<string, string> { ["pattern_type"] = pattern.Pattern, ["signal"] = pattern.Signal });
            }

            _logger.LogInformation(
                "Analyzed crypto {Symbol} for {Date}: {CandleCount} candles aggregated, {PatternCount} patterns detected",
                symbol, date, priceList.Count, patterns.Count);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing crypto {Symbol} for {Date}", symbol, date);
            await _metrics.IncrementCounterAsync("crypto_analysis_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "failed" });
            throw;
        }
    }

    public async Task<CryptoBatchAnalysisResult> AnalyzeAllCryptoAsync(DateOnly date, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new CryptoBatchAnalysisResult { AnalysisDate = date };

        try
        {
            var tickers = await _cryptoPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalCrypto = tickerList.Count;

            _logger.LogInformation("Starting crypto batch analysis for {Date} - {Count} tickers", date, tickerList.Count);

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var analysisResult = await AnalyzeCryptoAsync(ticker.Id, ticker.Symbol, date, cancellationToken);
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
                    _logger.LogError(ex, "Failed to analyze crypto {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            _logger.LogInformation(
                "Crypto batch analysis completed for {Date}: {Success}/{Total} tickers, {Patterns} patterns, {Duration:F2}s",
                date, result.SuccessCount, result.TotalCrypto, result.PatternsDetected, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Crypto batch analysis failed: {ex.Message}");
            _logger.LogError(ex, "Crypto batch analysis failed for {Date}", date);
            throw;
        }
    }

    public async Task<CryptoBatchAnalysisResult> AnalyzeDevelopingCryptoAsync(DateOnly today, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new CryptoBatchAnalysisResult { AnalysisDate = today };

        var hoursElapsed = DateTime.UtcNow.Hour + (DateTime.UtcNow.Minute / 60.0m);
        var confidence = Math.Clamp(hoursElapsed / 24.0m, 0m, 1m);

        if (confidence <= 0.5m)
        {
            _logger.LogInformation("Skipping developing crypto analysis — confidence {Confidence:F2} <= 0.50", confidence);
            result.Success = true;
            return result;
        }

        _logger.LogInformation("Running developing crypto analysis for {Date} with confidence {Confidence:F2}", today, confidence);

        try
        {
            var tickers = await _cryptoPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalCrypto = tickerList.Count;

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var prices = await _cryptoPriceRepository.GetPricesForDateAsync(ticker.Id, today);
                    var priceList = prices.ToList();
                    if (priceList.Count == 0) { result.SuccessCount++; continue; }

                    var dailyCandle = _aggregationService.AggregateToDailyCandle(priceList, ticker.Id, ticker.Symbol, today);
                    if (dailyCandle == null) { result.SuccessCount++; continue; }

                    dailyCandle.Timeframe = "daily";
                    dailyCandle.IsConfirmed = false;
                    dailyCandle.Confidence = confidence;

                    var patterns = _patternDetectionService.DetectPatterns(dailyCandle);
                    var analysisResult = CryptoAnalysisResult.FromCandle(dailyCandle, patterns);

                    await _cryptoAnalysisRepository.UpsertAnalysisAsync(analysisResult);
                    result.Results.Add(analysisResult);
                    result.SuccessCount++;
                    result.PatternsDetected += patterns.Count;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed developing crypto analysis for {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            _logger.LogInformation(
                "Developing crypto analysis completed for {Date}: {Success}/{Total}, {Patterns} patterns, confidence={Confidence:F2}, {Duration:F2}s",
                today, result.SuccessCount, result.TotalCrypto, result.PatternsDetected, confidence, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Developing crypto batch failed: {ex.Message}");
            _logger.LogError(ex, "Developing crypto analysis failed for {Date}", today);
            throw;
        }
    }

    public async Task<CryptoBatchAnalysisResult> AnalyzeWeeklyCryptoAsync(DateOnly weekEndDate, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new CryptoBatchAnalysisResult { AnalysisDate = weekEndDate };

        var dayOfWeek = weekEndDate.DayOfWeek;
        if (dayOfWeek != DayOfWeek.Sunday)
        {
            _logger.LogInformation("Skipping weekly crypto analysis — today is {Day}, not Sunday", dayOfWeek);
            result.Success = true;
            return result;
        }

        var sunday = weekEndDate;
        var monday = sunday.AddDays(-6);

        _logger.LogInformation("Running weekly crypto analysis for week {Monday} to {Sunday}", monday, sunday);

        try
        {
            var tickers = await _cryptoPriceRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalCrypto = tickerList.Count;

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var allPrices = new List<CryptoPrice>();
                    for (var d = monday; d <= sunday; d = d.AddDays(1))
                    {
                        var dayPrices = await _cryptoPriceRepository.GetPricesForDateAsync(ticker.Id, d);
                        allPrices.AddRange(dayPrices);
                    }

                    if (allPrices.Count == 0) { result.SuccessCount++; continue; }

                    var weeklyCandle = _aggregationService.AggregateToDailyCandle(allPrices, ticker.Id, ticker.Symbol, sunday);
                    if (weeklyCandle == null) { result.SuccessCount++; continue; }

                    weeklyCandle.Timeframe = "weekly";
                    weeklyCandle.IsConfirmed = true;
                    weeklyCandle.Confidence = 1.0m;

                    var patterns = _patternDetectionService.DetectPatterns(weeklyCandle);
                    var analysisResult = CryptoAnalysisResult.FromCandle(weeklyCandle, patterns);

                    await _cryptoAnalysisRepository.UpsertAnalysisAsync(analysisResult);
                    result.Results.Add(analysisResult);
                    result.SuccessCount++;
                    result.PatternsDetected += patterns.Count;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed weekly crypto analysis for {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            _logger.LogInformation(
                "Weekly crypto analysis completed for {Date}: {Success}/{Total}, {Patterns} patterns, {Duration:F2}s",
                sunday, result.SuccessCount, result.TotalCrypto, result.PatternsDetected, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Weekly crypto batch failed: {ex.Message}");
            _logger.LogError(ex, "Weekly crypto analysis failed for {Date}", weekEndDate);
            throw;
        }
    }
}
