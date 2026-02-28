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
}
