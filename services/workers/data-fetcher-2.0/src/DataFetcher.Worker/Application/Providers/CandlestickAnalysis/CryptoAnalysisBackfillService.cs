using System.Diagnostics;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Application.Providers.Massive;
using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public class CryptoAnalysisBackfillService : ICryptoAnalysisBackfillService
{
    private readonly ICryptoPriceRepository _cryptoPriceRepository;
    private readonly ICryptoAnalysisRepository _cryptoAnalysisRepository;
    private readonly ICryptoCandlestickAnalysisService _analysisService;
    private readonly CandlestickAnalysisSettings _settings;
    private readonly ILogger<CryptoAnalysisBackfillService> _logger;
    private readonly IMetricsClient _metrics;
    private readonly ICryptoPriceTargetBackfillService _priceTargetBackfillService;
    private readonly IMassiveIndicatorQueuePublisher _indicatorPublisher;
    private readonly IAdvancedIndicatorCalculatorService _advancedIndicatorService;

    public CryptoAnalysisBackfillService(
        ICryptoPriceRepository cryptoPriceRepository,
        ICryptoAnalysisRepository cryptoAnalysisRepository,
        ICryptoCandlestickAnalysisService analysisService,
        IOptions<CandlestickAnalysisSettings> settings,
        ILogger<CryptoAnalysisBackfillService> logger,
        IMetricsClient metrics,
        ICryptoPriceTargetBackfillService priceTargetBackfillService,
        IMassiveIndicatorQueuePublisher indicatorPublisher,
        IAdvancedIndicatorCalculatorService advancedIndicatorService)
    {
        _cryptoPriceRepository = cryptoPriceRepository;
        _cryptoAnalysisRepository = cryptoAnalysisRepository;
        _analysisService = analysisService;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
        _priceTargetBackfillService = priceTargetBackfillService;
        _indicatorPublisher = indicatorPublisher;
        _advancedIndicatorService = advancedIndicatorService;
    }

    public async Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new AnalysisBackfillResult { Symbol = request.Symbol };
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Starting crypto analysis backfill for {Symbol}", request.Symbol);

        try
        {
            var ticker = await GetTickerAsync(request);
            if (ticker == null)
                throw new InvalidOperationException($"Crypto ticker not found for symbol '{request.Symbol}'");

            _logger.LogInformation("Found crypto ticker {Symbol} (ID: {Id})", ticker.Symbol, ticker.Id);

            var daysToBackfill = request.DaysToBackfill ?? _settings.DaysToBackfill;
            var endDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
            var startDate = endDate.AddDays(-daysToBackfill);

            var priceDates = (await _cryptoPriceRepository.GetDistinctPriceDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();

            if (priceDates.Count == 0)
            {
                _logger.LogWarning("No crypto price data found for {Symbol} in {Start} to {End}", request.Symbol, startDate, endDate);
                result.Success = true;
                result.Duration = stopwatch.Elapsed;
                return result;
            }

            var analyzedDates = (await _cryptoAnalysisRepository.GetAnalyzedDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();
            var datesToProcess = priceDates.Except(analyzedDates).OrderBy(d => d).ToList();

            result.DatesSkipped = analyzedDates.Count;

            _logger.LogInformation(
                "Crypto backfill plan for {Symbol}: {ToProcess} dates to analyze, {Skipped} already analyzed",
                request.Symbol, datesToProcess.Count, result.DatesSkipped);

            if (datesToProcess.Count == 0)
            {
                result.Success = true;
                result.Duration = stopwatch.Elapsed;
                return result;
            }

            var totalPatternsDetected = 0;
            var processedCount = 0;

            foreach (var batch in datesToProcess.Chunk(_settings.BatchSizeDays))
            {
                if (cancellationToken.IsCancellationRequested) break;

                foreach (var date in batch)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    try
                    {
                        var analysisResult = await _analysisService.AnalyzeCryptoAsync(
                            ticker.Id, ticker.Symbol, date, cancellationToken);

                        if (analysisResult != null)
                            totalPatternsDetected += analysisResult.DetectedPatterns.Count;

                        processedCount++;

                        if (_settings.DelayBetweenDatesMs > 0)
                            await Task.Delay(_settings.DelayBetweenDatesMs, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error analyzing crypto {Symbol} for {Date}", request.Symbol, date);
                    }
                }

                if (_settings.DelayBetweenBatchesMs > 0 && !cancellationToken.IsCancellationRequested)
                    await Task.Delay(_settings.DelayBetweenBatchesMs, cancellationToken);
            }

            stopwatch.Stop();
            result.Success = true;
            result.DatesAnalyzed = processedCount;
            result.PatternsDetected = totalPatternsDetected;
            result.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Crypto backfill completed for {Symbol}: {Dates} dates analyzed, {Patterns} patterns, {Duration:F1}s",
                request.Symbol, result.DatesAnalyzed, result.PatternsDetected, result.Duration.TotalSeconds);

            await _metrics.IncrementCounterAsync("crypto_analysis_backfill_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "success" });

            try
            {
                var ptResult = await _priceTargetBackfillService.BackfillAsync(
                    ticker.Id, request.Symbol, daysToBackfill, cancellationToken);

                _logger.LogInformation(
                    "Crypto price target backfill for {Symbol}: {Computed} computed, {Skipped} skipped",
                    request.Symbol, ptResult.Computed, ptResult.Skipped);
            }
            catch (Exception ptEx)
            {
                _logger.LogError(ptEx, "Crypto price target backfill failed for {Symbol} (non-fatal)", request.Symbol);
            }

            _indicatorPublisher.PublishBackfill(request.Symbol, ticker.Id, "crypto", daysToBackfill);

            try
            {
                var advResult = await _advancedIndicatorService.BackfillCryptoAdvancedIndicatorsAsync(
                    ticker.Id, request.Symbol, cancellationToken);

                _logger.LogInformation(
                    "Advanced indicator backfill for crypto {Symbol}: {Computed} days computed, {Skipped} skipped",
                    request.Symbol, advResult.DaysComputed, advResult.DaysSkipped);
            }
            catch (Exception advEx)
            {
                _logger.LogError(advEx, "Advanced indicator backfill failed for crypto {Symbol} (non-fatal)", request.Symbol);
            }
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.Success = false;
            result.Error = ex.Message;
            result.Duration = stopwatch.Elapsed;

            _logger.LogError(ex, "Crypto backfill failed for {Symbol}", request.Symbol);

            await _metrics.IncrementCounterAsync("crypto_analysis_backfill_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "error" });
        }

        return result;
    }

    private async Task<Domain.Common.Entities.CryptoTicker?> GetTickerAsync(AnalysisBackfillRequest request)
    {
        if (request.TickerId.HasValue)
        {
            var tickers = await _cryptoPriceRepository.GetActiveTickersAsync();
            return tickers.FirstOrDefault(t => t.Id == request.TickerId.Value);
        }

        return await _cryptoPriceRepository.GetTickerBySymbolAsync(request.Symbol);
    }
}
