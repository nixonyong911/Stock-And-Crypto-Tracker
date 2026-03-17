using System.Diagnostics;
using DataFetcher.Worker.Application.Providers.Pipeline;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public class CryptoAnalysisBackfillService : ICryptoAnalysisBackfillService
{
    private readonly ICryptoPriceRepository _cryptoPriceRepository;
    private readonly CandlestickAnalysisSettings _settings;
    private readonly ILogger<CryptoAnalysisBackfillService> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IBackfillPipelineExecutor _pipelineExecutor;

    public CryptoAnalysisBackfillService(
        ICryptoPriceRepository cryptoPriceRepository,
        IOptions<CandlestickAnalysisSettings> settings,
        ILogger<CryptoAnalysisBackfillService> logger,
        IMetricsClient metrics,
        IBackfillPipelineExecutor pipelineExecutor)
    {
        _cryptoPriceRepository = cryptoPriceRepository;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
        _pipelineExecutor = pipelineExecutor;
    }

    public async Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new AnalysisBackfillResult { Symbol = request.Symbol };
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Starting crypto analysis backfill for {Symbol}", request.Symbol);

        try
        {
            var tickerId = await ResolveTickerIdAsync(request);

            var context = new BackfillContext
            {
                TickerId = tickerId,
                Symbol = request.Symbol,
                AssetType = "crypto",
                DaysToBackfill = request.DaysToBackfill ?? _settings.DaysToBackfill
            };

            var pipelineResult = await _pipelineExecutor.ExecuteAsync(context, cancellationToken);

            stopwatch.Stop();

            result.Success = pipelineResult.Success;
            result.Duration = stopwatch.Elapsed;

            if (context.StepData.TryGetValue("DatesAnalyzed", out var datesObj) && datesObj is int dates)
                result.DatesAnalyzed = dates;
            if (context.StepData.TryGetValue("DatesSkipped", out var skippedObj) && skippedObj is int skipped)
                result.DatesSkipped = skipped;
            if (context.StepData.TryGetValue("PatternsDetected", out var patternsObj) && patternsObj is int patterns)
                result.PatternsDetected = patterns;

            var failedSteps = pipelineResult.StepOutcomes.Where(o => !o.Success).ToList();
            if (failedSteps.Count > 0)
                result.Error = string.Join("; ", failedSteps.Select(s => $"[{s.StepName}]: {s.Error}"));

            _logger.LogInformation(
                "Crypto backfill completed for {Symbol}: {Dates} dates analyzed, {Patterns} patterns, {Duration:F1}s",
                request.Symbol, result.DatesAnalyzed, result.PatternsDetected, result.Duration.TotalSeconds);

            await _metrics.IncrementCounterAsync("crypto_analysis_backfill_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "success" });
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

    private async Task<int> ResolveTickerIdAsync(AnalysisBackfillRequest request)
    {
        if (request.TickerId.HasValue)
            return request.TickerId.Value;

        var ticker = await _cryptoPriceRepository.GetTickerBySymbolAsync(request.Symbol);
        return ticker?.Id ?? 0;
    }
}
