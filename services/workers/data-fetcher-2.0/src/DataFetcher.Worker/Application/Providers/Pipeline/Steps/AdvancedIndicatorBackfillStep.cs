using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Application.Providers.LocalIndicators;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class AdvancedIndicatorBackfillStep : IBackfillStep
{
    public string Name => "AdvancedIndicatorBackfill";
    public int Order => 400;

    private readonly IAdvancedIndicatorCalculatorService _advancedIndicatorService;
    private readonly IFinnhubExternalIndicatorService _externalIndicatorService;
    private readonly ILogger<AdvancedIndicatorBackfillStep> _logger;

    public AdvancedIndicatorBackfillStep(
        IAdvancedIndicatorCalculatorService advancedIndicatorService,
        IFinnhubExternalIndicatorService externalIndicatorService,
        ILogger<AdvancedIndicatorBackfillStep> logger)
    {
        _advancedIndicatorService = advancedIndicatorService;
        _externalIndicatorService = externalIndicatorService;
        _logger = logger;
    }

    public bool AppliesTo(string assetType) => true;

    public async Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        if (context.TickerId <= 0)
            return new StepResult(false, "TickerId not resolved by a prior step");

        if (string.Equals(context.AssetType, "crypto", StringComparison.OrdinalIgnoreCase))
        {
            var result = await _advancedIndicatorService.BackfillCryptoAdvancedIndicatorsAsync(
                context.TickerId, context.Symbol, ct);

            _logger.LogInformation(
                "Advanced indicator backfill for crypto {Symbol}: {Computed} days computed, {Skipped} skipped",
                context.Symbol, result.DaysComputed, result.DaysSkipped);
        }
        else
        {
            var result = await _advancedIndicatorService.BackfillStockAdvancedIndicatorsAsync(
                context.TickerId, context.Symbol, ct);

            _logger.LogInformation(
                "Advanced indicator backfill for {Symbol}: {Computed} days computed, {Skipped} skipped",
                context.Symbol, result.DaysComputed, result.DaysSkipped);

            try
            {
                await _externalIndicatorService.FetchStockExternalIndicatorsAsync(context.TickerId, context.Symbol, ct);
                _logger.LogInformation("External indicators fetched for {Symbol} during backfill", context.Symbol);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "External indicator fetch failed for {Symbol} during backfill (non-blocking)", context.Symbol);
            }
        }

        return new StepResult(true);
    }
}
