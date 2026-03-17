using System.Diagnostics;
using DataFetcher.Worker.Application.Providers.Pipeline;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public class AnalysisBackfillService : IAnalysisBackfillService
{
    private readonly IStockPriceRepository _stockPriceRepository;
    private readonly CandlestickAnalysisSettings _settings;
    private readonly ILogger<AnalysisBackfillService> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IBackfillPipelineExecutor _pipelineExecutor;

    public AnalysisBackfillService(
        IStockPriceRepository stockPriceRepository,
        IOptions<CandlestickAnalysisSettings> settings,
        ILogger<AnalysisBackfillService> logger,
        IMetricsClient metrics,
        IBackfillPipelineExecutor pipelineExecutor)
    {
        _stockPriceRepository = stockPriceRepository;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
        _pipelineExecutor = pipelineExecutor;
    }

    public async Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new AnalysisBackfillResult { Symbol = request.Symbol };
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation(
            "Starting analysis backfill for {Symbol} - Days to backfill: {Days}",
            request.Symbol,
            request.DaysToBackfill ?? _settings.DaysToBackfill);

        try
        {
            var tickerId = await ResolveTickerIdAsync(request);

            var context = new BackfillContext
            {
                TickerId = tickerId,
                Symbol = request.Symbol,
                AssetType = "stock",
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
                "Backfill completed for {Symbol}: {Dates} dates analyzed, {Patterns} patterns detected, Duration: {Duration:F1}s",
                request.Symbol, result.DatesAnalyzed, result.PatternsDetected, result.Duration.TotalSeconds);

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

    private async Task<int> ResolveTickerIdAsync(AnalysisBackfillRequest request)
    {
        if (request.TickerId.HasValue)
            return request.TickerId.Value;

        var ticker = await _stockPriceRepository.GetTickerBySymbolAsync(request.Symbol);
        return ticker?.Id ?? 0;
    }
}
