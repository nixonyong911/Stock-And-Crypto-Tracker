namespace DataFetcher.Worker.Application.Providers.Fred;

public static class MediaValueCalculator
{
    public const string ModeRate = "rate";
    public const string ModeYoYPct = "yoy_pct";
    public const string ModeTrillionsFromBillions = "trillions_from_billions";
    public const string ModeTrillionsFromMillions = "trillions_from_millions";

    public static double? CalculateMediaValue(string displayMode, double rawValue, double? yearAgoValue, double divisor)
    {
        return displayMode switch
        {
            ModeRate => rawValue,
            ModeYoYPct => yearAgoValue is null or 0
                ? null
                : Math.Round(((rawValue - yearAgoValue.Value) / yearAgoValue.Value) * 100, 1),
            ModeTrillionsFromBillions => Math.Round(rawValue / 1000, 2),
            ModeTrillionsFromMillions => Math.Round(rawValue / 1000000, 2),
            _ => rawValue
        };
    }

    public static bool NeedsYearAgoData(string displayMode) => displayMode == ModeYoYPct;
}
