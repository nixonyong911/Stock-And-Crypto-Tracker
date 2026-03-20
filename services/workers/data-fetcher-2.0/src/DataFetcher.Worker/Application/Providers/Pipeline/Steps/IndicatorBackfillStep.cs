using DataFetcher.Worker.Application.Providers.Indicators;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class IndicatorBackfillStep : IBackfillStep
{
    public string Name => "IndicatorBackfill";
    public int Order => 400;

    private readonly IIndicatorRegistry _registry;
    private readonly ILogger<IndicatorBackfillStep> _logger;

    public IndicatorBackfillStep(
        IIndicatorRegistry registry,
        ILogger<IndicatorBackfillStep> logger)
    {
        _registry = registry;
        _logger = logger;
    }

    public bool AppliesTo(string assetType) => true;

    public async Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        if (context.TickerId <= 0)
            return new StepResult(false, "TickerId not resolved by a prior step");

        var indicators = _registry.GetForAssetType(context.AssetType);
        var succeeded = 0;
        var failed = 0;

        foreach (var indicator in indicators)
        {
            try
            {
                var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-context.DaysToBackfill));
                var to = DateOnly.FromDateTime(DateTime.UtcNow);
                await indicator.BackfillAsync(context.TickerId, context.Symbol, from, to, ct);
                succeeded++;
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogWarning(ex,
                    "Indicator {Name} backfill failed for {Symbol} (non-blocking)",
                    indicator.IndicatorName, context.Symbol);
            }
        }

        return new StepResult(succeeded > 0,
            failed > 0 ? $"{failed}/{indicators.Count} indicators failed" : null);
    }
}
