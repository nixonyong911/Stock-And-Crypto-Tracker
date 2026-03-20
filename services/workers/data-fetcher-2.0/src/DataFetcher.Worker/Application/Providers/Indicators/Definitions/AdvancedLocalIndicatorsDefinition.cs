using DataFetcher.Worker.Application.Providers.LocalIndicators;

namespace DataFetcher.Worker.Application.Providers.Indicators.Definitions;

public class AdvancedLocalIndicatorsDefinition : IIndicatorDefinition
{
    private readonly IAdvancedIndicatorCalculatorService _calculatorService;

    public AdvancedLocalIndicatorsDefinition(IAdvancedIndicatorCalculatorService calculatorService)
    {
        _calculatorService = calculatorService;
    }

    public string IndicatorName => "AdvancedLocalIndicators";
    public IndicatorCategory Category => IndicatorCategory.Advanced;

    public string[] OutputColumns =>
    [
        "bollinger_upper", "bollinger_lower", "bollinger_middle", "bollinger_bandwidth",
        "atr", "stoch_k", "stoch_d", "adx", "obv",
        "fibonacci_levels", "pivot_levels",
        "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b", "ichimoku_chikou"
    ];

    public string TargetTable(string assetType) => assetType == "crypto"
        ? "analysis_indicators_crypto_pro"
        : "analysis_indicators_stock_pro";

    public bool AppliesTo(string assetType) => true;

    public string[] DependsOnTables =>
        ["analysis_indicators_stock_free", "analysis_indicators_crypto_free"];

    public ICompletenessRule CompletenessRule =>
        new StockTradingDayRule { Cadence = DataCadence.Daily };

    public ScheduleConfig GetScheduleConfig() => new(
        ScheduleName: "Local Indicator Computation",
        Interval: TimeSpan.FromMinutes(30),
        OffsetFromBaseline: TimeSpan.FromMinutes(12),
        DependsOn: ["BasicIndicators"]
    );

    public async Task<BackfillResult> BackfillAsync(
        int tickerId, string symbol, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var isCrypto = symbol.Contains('/');
        var result = isCrypto
            ? await _calculatorService.BackfillCryptoAdvancedIndicatorsAsync(tickerId, symbol, ct)
            : await _calculatorService.BackfillStockAdvancedIndicatorsAsync(tickerId, symbol, ct);
        return new BackfillResult(result.DaysComputed, result.DaysSkipped, result.Error);
    }
}
