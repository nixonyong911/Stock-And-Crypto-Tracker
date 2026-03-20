using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class PriceTargetComputeStep : ComputeStepBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PriceTargetComputeStep> _logger;

    public PriceTargetComputeStep(
        IServiceProvider serviceProvider,
        ILogger<PriceTargetComputeStep> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public override string StepName => "PriceTargets";
    public override int Priority => 100;
    public override string[] DependsOn => ["CandlestickAnalysis", "BasicIndicators"];
    public override string[] WritesToTables => ["analysis_ticker_price_targets"];
    public override string[] ReadsFromTables =>
    [
        "analysis_stock_candlestick_pattern", "analysis_crypto_candlestick_pattern",
        "analysis_indicators_stock_free", "analysis_indicators_crypto_free"
    ];

    public override async Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();

        try
        {
            if (ctx.AssetType == "crypto")
            {
                var svc = scope.ServiceProvider.GetRequiredService<ICryptoPriceTargetService>();
                var result = await svc.CalculateAllCryptoAsync(ctx.AnalyzeDate, ct);
                _logger.LogInformation(
                    "Crypto price targets complete: {Success}/{Total} in {Duration:F1}s",
                    result.SuccessCount, result.TotalStocks, result.DurationSeconds);
                return new ComputeStepResult(result.SuccessCount, result.SkippedCount);
            }
            else
            {
                var svc = scope.ServiceProvider.GetRequiredService<IPriceTargetService>();
                var result = await svc.CalculateAllStocksAsync(ctx.AnalyzeDate, ct);
                _logger.LogInformation(
                    "Stock price targets complete: {Success}/{Total} in {Duration:F1}s",
                    result.SuccessCount, result.TotalStocks, result.DurationSeconds);
                return new ComputeStepResult(result.SuccessCount, result.SkippedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PriceTargets failed for {AssetType}", ctx.AssetType);
            return new ComputeStepResult(0, 0, ex.Message);
        }
    }
}
