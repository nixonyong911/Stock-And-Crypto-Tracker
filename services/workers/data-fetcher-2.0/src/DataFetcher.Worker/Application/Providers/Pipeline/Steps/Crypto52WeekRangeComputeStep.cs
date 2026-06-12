using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

/// <summary>
/// Daily 52-week range refresh for crypto tickers, sourced from Alpaca 1Day
/// bars (stored candle history only goes back ~6 months, so the range cannot
/// be derived locally). Independent of the other compute steps; the service
/// itself no-ops when today's ranges already exist.
/// </summary>
public class Crypto52WeekRangeComputeStep : ComputeStepBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<Crypto52WeekRangeComputeStep> _logger;

    public Crypto52WeekRangeComputeStep(
        IServiceProvider serviceProvider,
        ILogger<Crypto52WeekRangeComputeStep> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public override string StepName => "Crypto52WeekRange";
    public override int Priority => 60;
    public override string[] WritesToTables => ["analysis_crypto_range_52w"];
    public override bool AppliesTo(string assetType) => assetType == "crypto";

    public override async Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var rangeService = scope.ServiceProvider.GetRequiredService<ICrypto52WeekRangeService>();

        try
        {
            var count = await rangeService.RefreshAllAsync(ct);
            return new ComputeStepResult(count, 0);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Crypto 52-week range refresh failed");
            return new ComputeStepResult(0, 0, ex.Message);
        }
    }
}
