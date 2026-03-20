namespace DataFetcher.Worker.Application.Providers.Indicators;

public interface ICompletenessRule
{
    DataCadence Cadence { get; }
    int ExpectedRowsPerTradingDay(string assetType);
    bool IsExpectedGap(DateOnly date, string symbol, string assetType);
}

public class StockTradingDayRule : ICompletenessRule
{
    public DataCadence Cadence { get; init; } = DataCadence.Daily;

    private static readonly HashSet<DayOfWeek> Weekends = [DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static readonly HashSet<DateOnly> UsHolidays2026 =
    [
        new(2026, 1, 1),   // New Year's Day
        new(2026, 1, 19),  // MLK Day
        new(2026, 2, 16),  // Presidents' Day
        new(2026, 4, 3),   // Good Friday
        new(2026, 5, 25),  // Memorial Day
        new(2026, 7, 3),   // Independence Day (observed)
        new(2026, 9, 7),   // Labor Day
        new(2026, 11, 26), // Thanksgiving
        new(2026, 12, 25), // Christmas
    ];

    public int ExpectedRowsPerTradingDay(string assetType) => Cadence switch
    {
        DataCadence.Intraday15Min => assetType == "crypto" ? 96 : 26,
        DataCadence.Intraday30Min => assetType == "crypto" ? 48 : 13,
        DataCadence.Daily => 1,
        DataCadence.Weekly => 0,
        _ => 1
    };

    public bool IsExpectedGap(DateOnly date, string symbol, string assetType)
    {
        if (string.Equals(assetType, "crypto", StringComparison.OrdinalIgnoreCase))
            return false;

        if (Weekends.Contains(date.DayOfWeek)) return true;
        if (UsHolidays2026.Contains(date)) return true;

        return false;
    }
}

public class ExternalDailyRule : ICompletenessRule
{
    public DataCadence Cadence => DataCadence.Daily;
    public int ExpectedRowsPerTradingDay(string assetType) => 1;

    public bool IsExpectedGap(DateOnly date, string symbol, string assetType)
        => new StockTradingDayRule().IsExpectedGap(date, symbol, assetType);
}

public class CryptoAlwaysOnRule : ICompletenessRule
{
    public DataCadence Cadence { get; init; } = DataCadence.Daily;

    public int ExpectedRowsPerTradingDay(string assetType) => Cadence switch
    {
        DataCadence.Intraday15Min => 96,
        DataCadence.Intraday30Min => 48,
        DataCadence.Daily => 1,
        _ => 1
    };

    public bool IsExpectedGap(DateOnly date, string symbol, string assetType) => false;
}
