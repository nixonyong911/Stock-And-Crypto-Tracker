using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

/// <summary>
/// Daily 52-week range + long-MA refresh for stock-universe tickers, sourced
/// from eToro OneDay candles (stored candle history only reaches back a few
/// months, so SMA-200 / 52-week extremes cannot be derived locally; Finnhub
/// fundamentals carry no range for indexes/ETFs at all). Independent of the
/// other compute steps; the service no-ops when today's metrics already exist.
/// </summary>
public class StockTrendMetricsComputeStep : ComputeStepBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StockTrendMetricsComputeStep> _logger;

    public StockTrendMetricsComputeStep(
        IServiceProvider serviceProvider,
        ILogger<StockTrendMetricsComputeStep> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public override string StepName => "StockTrendMetrics";
    public override int Priority => 60;
    public override string[] WritesToTables => ["analysis_stock_trend_metrics"];
    public override bool AppliesTo(string assetType) => assetType == "stock";

    public override async Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var metricsService = scope.ServiceProvider.GetRequiredService<IStockTrendMetricsService>();

        try
        {
            var count = await metricsService.RefreshAllAsync(ct);
            return new ComputeStepResult(count, 0);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Stock trend metrics refresh failed");
            return new ComputeStepResult(0, 0, ex.Message);
        }
    }
}
