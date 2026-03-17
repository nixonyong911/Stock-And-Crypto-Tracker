using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class PriceTargetBackfillStep : IBackfillStep
{
    public string Name => "PriceTargetBackfill";
    public int Order => 200;

    private readonly IPriceTargetBackfillService _stockPriceTargetService;
    private readonly ICryptoPriceTargetBackfillService _cryptoPriceTargetService;
    private readonly ILogger<PriceTargetBackfillStep> _logger;

    public PriceTargetBackfillStep(
        IPriceTargetBackfillService stockPriceTargetService,
        ICryptoPriceTargetBackfillService cryptoPriceTargetService,
        ILogger<PriceTargetBackfillStep> logger)
    {
        _stockPriceTargetService = stockPriceTargetService;
        _cryptoPriceTargetService = cryptoPriceTargetService;
        _logger = logger;
    }

    public bool AppliesTo(string assetType) => true;

    public async Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        if (context.TickerId <= 0)
            return new StepResult(false, "TickerId not resolved by a prior step");

        if (string.Equals(context.AssetType, "crypto", StringComparison.OrdinalIgnoreCase))
        {
            var result = await _cryptoPriceTargetService.BackfillAsync(
                context.TickerId, context.Symbol, context.DaysToBackfill, ct);

            _logger.LogInformation(
                "Crypto price target backfill for {Symbol}: {Computed} computed, {Skipped} skipped",
                context.Symbol, result.Computed, result.Skipped);
        }
        else
        {
            var result = await _stockPriceTargetService.BackfillAsync(
                context.TickerId, context.Symbol, context.DaysToBackfill, ct);

            _logger.LogInformation(
                "Price target backfill for {Symbol}: {Computed} computed, {Skipped} skipped",
                context.Symbol, result.Computed, result.Skipped);
        }

        return new StepResult(true);
    }
}
