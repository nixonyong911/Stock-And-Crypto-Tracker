using DataFetcher.Worker.Application.Providers.LocalIndicators;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class BasicIndicatorsComputeStep : ComputeStepBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BasicIndicatorsComputeStep> _logger;

    public BasicIndicatorsComputeStep(
        IServiceProvider serviceProvider,
        ILogger<BasicIndicatorsComputeStep> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public override string StepName => "BasicIndicators";
    public override int Priority => 10;
    public override string[] DependsOn => [];
    public override string[] WritesToTables =>
        ["analysis_indicators_stock_free", "analysis_indicators_crypto_free"];
    public override string[] ReadsFromTables => ["stock_prices", "crypto_prices"];

    public override async Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var svc = scope.ServiceProvider.GetRequiredService<ILocalIndicatorCalculatorService>();

        try
        {
            if (ctx.AssetType == "crypto")
            {
                var result = await svc.ComputeAllCryptoIndicatorsAsync(ct);
                _logger.LogInformation(
                    "Crypto basic indicators complete: {Success}/{Total}",
                    result.SuccessCount, result.TotalTickers);
                return new ComputeStepResult(result.SuccessCount, result.SkippedCount);
            }
            else
            {
                var result = await svc.ComputeAllStockIndicatorsAsync(ct);
                _logger.LogInformation(
                    "Stock basic indicators complete: {Success}/{Total}",
                    result.SuccessCount, result.TotalTickers);
                return new ComputeStepResult(result.SuccessCount, result.SkippedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "BasicIndicators failed for {AssetType}", ctx.AssetType);
            return new ComputeStepResult(0, 0, ex.Message);
        }
    }
}
