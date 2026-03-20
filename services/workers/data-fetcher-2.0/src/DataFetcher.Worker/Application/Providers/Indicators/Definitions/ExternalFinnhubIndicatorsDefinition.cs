using DataFetcher.Worker.Application.Providers.Finnhub;

namespace DataFetcher.Worker.Application.Providers.Indicators.Definitions;

/// <summary>
/// Single definition for all Finnhub external indicators (insider transactions + analyst recommendations).
/// FetchStockExternalIndicatorsAsync makes 3 API calls per ticker and writes all columns in one upsert,
/// so splitting into separate definitions would double API consumption.
/// </summary>
public class ExternalFinnhubIndicatorsDefinition : IIndicatorDefinition
{
    private readonly IFinnhubExternalIndicatorService _externalService;

    public ExternalFinnhubIndicatorsDefinition(IFinnhubExternalIndicatorService externalService)
    {
        _externalService = externalService;
    }

    public string IndicatorName => "ExternalFinnhubIndicators";
    public IndicatorCategory Category => IndicatorCategory.External;

    public string[] OutputColumns =>
    [
        "insider_buy_count", "insider_sell_count", "insider_net_shares", "insider_net_value",
        "analyst_buy", "analyst_hold", "analyst_sell", "analyst_strong_buy", "analyst_strong_sell"
    ];

    public string TargetTable(string assetType) => "analysis_indicators_stock_pro";

    public bool AppliesTo(string assetType) =>
        string.Equals(assetType, "stock", StringComparison.OrdinalIgnoreCase);

    public string[] DependsOnTables => [];

    public ICompletenessRule CompletenessRule => new ExternalDailyRule();

    public ScheduleConfig GetScheduleConfig() => new(
        ScheduleName: "Finnhub Daily Fundamentals",
        Interval: TimeSpan.FromHours(24),
        OffsetFromBaseline: null,
        DependsOn: []
    );

    public async Task<BackfillResult> BackfillAsync(
        int tickerId, string symbol, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var success = await _externalService.FetchStockExternalIndicatorsAsync(tickerId, symbol, ct);
        return new BackfillResult(success ? 1 : 0, 0, success ? null : "External fetch failed");
    }
}
