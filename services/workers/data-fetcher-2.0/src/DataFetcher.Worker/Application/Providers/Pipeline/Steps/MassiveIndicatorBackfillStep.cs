using DataFetcher.Worker.Application.Providers.Massive;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class MassiveIndicatorBackfillStep : IBackfillStep
{
    public string Name => "MassiveIndicatorPublish";
    public int Order => 300;

    private readonly IMassiveIndicatorQueuePublisher _indicatorPublisher;
    private readonly ILogger<MassiveIndicatorBackfillStep> _logger;

    public MassiveIndicatorBackfillStep(
        IMassiveIndicatorQueuePublisher indicatorPublisher,
        ILogger<MassiveIndicatorBackfillStep> logger)
    {
        _indicatorPublisher = indicatorPublisher;
        _logger = logger;
    }

    public bool AppliesTo(string assetType) => true;

    public Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        if (context.TickerId <= 0)
            return Task.FromResult(new StepResult(false, "TickerId not resolved by a prior step"));

        _indicatorPublisher.PublishBackfill(context.Symbol, context.TickerId, context.AssetType, context.DaysToBackfill);

        _logger.LogInformation("Published massive indicator backfill for {Symbol} ({AssetType})",
            context.Symbol, context.AssetType);

        return Task.FromResult(new StepResult(true));
    }
}
