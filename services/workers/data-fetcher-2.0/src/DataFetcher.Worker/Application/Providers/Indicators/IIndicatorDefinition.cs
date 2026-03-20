namespace DataFetcher.Worker.Application.Providers.Indicators;

public enum DataCadence
{
    Intraday15Min,
    Intraday30Min,
    Daily,
    Weekly,
}

public interface IIndicatorDefinition
{
    string IndicatorName { get; }
    IndicatorCategory Category { get; }
    string[] OutputColumns { get; }
    string TargetTable(string assetType);
    bool AppliesTo(string assetType);
    string[] DependsOnTables { get; }

    ICompletenessRule CompletenessRule { get; }
    ScheduleConfig GetScheduleConfig();

    Task<BackfillResult> BackfillAsync(int tickerId, string symbol,
        DateOnly from, DateOnly to, CancellationToken ct);
}

public record ScheduleConfig(
    string ScheduleName,
    TimeSpan Interval,
    TimeSpan? OffsetFromBaseline,
    string[] DependsOn
);

public record BackfillResult(int DaysComputed, int DaysSkipped, string? Error = null);
