namespace DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

public record PriceTargetParameters
{
    public string AssetType { get; init; } = "stock";
    public string TraderType { get; init; } = "swing";
    public int LookbackDays { get; init; } = 20;
    public decimal StopLossPct { get; init; } = 0.03m;
    public decimal OverboughtRsi { get; init; } = 70m;
    public decimal OversoldRsi { get; init; } = 30m;
    public decimal OverboughtDiscount { get; init; } = 0.02m;
    public decimal OversoldBounce { get; init; } = 0.05m;
    public decimal TrendWeight { get; init; } = 0.40m;
    public decimal MomentumWeight { get; init; } = 0.30m;
    public decimal PatternWeight { get; init; } = 0.30m;
    public decimal BullishThreshold { get; init; } = 0.20m;
    public decimal BearishThreshold { get; init; } = -0.20m;
    public decimal EntryRangePct { get; init; } = 0.02m;
    public bool IsActive { get; init; } = true;
}
