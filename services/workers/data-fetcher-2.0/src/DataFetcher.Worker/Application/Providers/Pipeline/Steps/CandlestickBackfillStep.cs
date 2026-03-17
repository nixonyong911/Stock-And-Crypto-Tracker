using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class CandlestickBackfillStep : IBackfillStep
{
    public string Name => "CandlestickAnalysis";
    public int Order => 100;

    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly IAnalysisRepository _analysisRepository;
    private readonly ICandlestickAnalysisService _stockAnalysisService;
    private readonly ICryptoPriceRepository _cryptoPriceRepository;
    private readonly ICryptoAnalysisRepository _cryptoAnalysisRepository;
    private readonly ICryptoCandlestickAnalysisService _cryptoAnalysisService;
    private readonly CandlestickAnalysisSettings _settings;
    private readonly ILogger<CandlestickBackfillStep> _logger;

    public CandlestickBackfillStep(
        IStockPriceRepository stockPriceRepository,
        IAnalysisRepository analysisRepository,
        ICandlestickAnalysisService stockAnalysisService,
        ICryptoPriceRepository cryptoPriceRepository,
        ICryptoAnalysisRepository cryptoAnalysisRepository,
        ICryptoCandlestickAnalysisService cryptoAnalysisService,
        IOptions<CandlestickAnalysisSettings> settings,
        ILogger<CandlestickBackfillStep> logger)
    {
        _stockPriceRepository = stockPriceRepository;
        _analysisRepository = analysisRepository;
        _stockAnalysisService = stockAnalysisService;
        _cryptoPriceRepository = cryptoPriceRepository;
        _cryptoAnalysisRepository = cryptoAnalysisRepository;
        _cryptoAnalysisService = cryptoAnalysisService;
        _settings = settings.Value;
        _logger = logger;
    }

    public bool AppliesTo(string assetType) => true;

    public async Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        if (string.Equals(context.AssetType, "crypto", StringComparison.OrdinalIgnoreCase))
            return await ExecuteCryptoAsync(context, ct);

        return await ExecuteStockAsync(context, ct);
    }

    private async Task<StepResult> ExecuteStockAsync(BackfillContext context, CancellationToken ct)
    {
        var ticker = await ResolveStockTickerAsync(context);
        if (ticker == null)
            return new StepResult(false, $"Stock ticker not found for symbol '{context.Symbol}'");

        context.TickerId = ticker.Id;
        context.StepData["TickerId"] = ticker.Id;

        var endDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var startDate = endDate.AddDays(-context.DaysToBackfill);

        var priceDates = (await _stockPriceRepository.GetDistinctPriceDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();
        if (priceDates.Count == 0)
        {
            _logger.LogWarning("No price data found for {Symbol} in {Start} to {End}", context.Symbol, startDate, endDate);
            return new StepResult(true);
        }

        var analyzedDates = (await _analysisRepository.GetAnalyzedDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();
        var datesToProcess = priceDates.Except(analyzedDates).OrderBy(d => d).ToList();

        context.StepData["DatesSkipped"] = analyzedDates.Count;

        if (datesToProcess.Count == 0)
        {
            _logger.LogInformation("All dates already analyzed for {Symbol}", context.Symbol);
            return new StepResult(true);
        }

        _logger.LogInformation("Candlestick backfill for {Symbol}: {Count} dates to process", context.Symbol, datesToProcess.Count);

        var processedCount = 0;
        var totalPatterns = 0;

        foreach (var batch in datesToProcess.Chunk(_settings.BatchSizeDays))
        {
            if (ct.IsCancellationRequested) break;

            foreach (var date in batch)
            {
                if (ct.IsCancellationRequested) break;

                try
                {
                    var analysisResult = await _stockAnalysisService.AnalyzeStockAsync(ticker.Id, ticker.Symbol, date, ct);
                    if (analysisResult != null)
                        totalPatterns += analysisResult.DetectedPatterns.Count;

                    processedCount++;

                    if (_settings.DelayBetweenDatesMs > 0)
                        await Task.Delay(_settings.DelayBetweenDatesMs, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error analyzing {Symbol} for {Date}", context.Symbol, date);
                }
            }

            if (_settings.DelayBetweenBatchesMs > 0 && !ct.IsCancellationRequested)
                await Task.Delay(_settings.DelayBetweenBatchesMs, ct);
        }

        context.StepData["DatesAnalyzed"] = processedCount;
        context.StepData["PatternsDetected"] = totalPatterns;

        return new StepResult(true);
    }

    private async Task<StepResult> ExecuteCryptoAsync(BackfillContext context, CancellationToken ct)
    {
        var ticker = await ResolveCryptoTickerAsync(context);
        if (ticker == null)
            return new StepResult(false, $"Crypto ticker not found for symbol '{context.Symbol}'");

        context.TickerId = ticker.Id;
        context.StepData["TickerId"] = ticker.Id;

        var endDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var startDate = endDate.AddDays(-context.DaysToBackfill);

        var priceDates = (await _cryptoPriceRepository.GetDistinctPriceDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();
        if (priceDates.Count == 0)
        {
            _logger.LogWarning("No crypto price data found for {Symbol} in {Start} to {End}", context.Symbol, startDate, endDate);
            return new StepResult(true);
        }

        var analyzedDates = (await _cryptoAnalysisRepository.GetAnalyzedDatesAsync(ticker.Id, startDate, endDate)).ToHashSet();
        var datesToProcess = priceDates.Except(analyzedDates).OrderBy(d => d).ToList();

        context.StepData["DatesSkipped"] = analyzedDates.Count;

        if (datesToProcess.Count == 0)
        {
            _logger.LogInformation("All dates already analyzed for crypto {Symbol}", context.Symbol);
            return new StepResult(true);
        }

        _logger.LogInformation("Crypto candlestick backfill for {Symbol}: {Count} dates to process", context.Symbol, datesToProcess.Count);

        var processedCount = 0;
        var totalPatterns = 0;

        foreach (var batch in datesToProcess.Chunk(_settings.BatchSizeDays))
        {
            if (ct.IsCancellationRequested) break;

            foreach (var date in batch)
            {
                if (ct.IsCancellationRequested) break;

                try
                {
                    var analysisResult = await _cryptoAnalysisService.AnalyzeCryptoAsync(ticker.Id, ticker.Symbol, date, ct);
                    if (analysisResult != null)
                        totalPatterns += analysisResult.DetectedPatterns.Count;

                    processedCount++;

                    if (_settings.DelayBetweenDatesMs > 0)
                        await Task.Delay(_settings.DelayBetweenDatesMs, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error analyzing crypto {Symbol} for {Date}", context.Symbol, date);
                }
            }

            if (_settings.DelayBetweenBatchesMs > 0 && !ct.IsCancellationRequested)
                await Task.Delay(_settings.DelayBetweenBatchesMs, ct);
        }

        context.StepData["DatesAnalyzed"] = processedCount;
        context.StepData["PatternsDetected"] = totalPatterns;

        return new StepResult(true);
    }

    private async Task<Domain.Common.Entities.StockTicker?> ResolveStockTickerAsync(BackfillContext context)
    {
        if (context.TickerId > 0)
        {
            var tickers = await _stockPriceRepository.GetActiveTickersAsync();
            return tickers.FirstOrDefault(t => t.Id == context.TickerId);
        }

        return await _stockPriceRepository.GetTickerBySymbolAsync(context.Symbol);
    }

    private async Task<Domain.Common.Entities.CryptoTicker?> ResolveCryptoTickerAsync(BackfillContext context)
    {
        if (context.TickerId > 0)
        {
            var tickers = await _cryptoPriceRepository.GetActiveTickersAsync();
            return tickers.FirstOrDefault(t => t.Id == context.TickerId);
        }

        return await _cryptoPriceRepository.GetTickerBySymbolAsync(context.Symbol);
    }
}
