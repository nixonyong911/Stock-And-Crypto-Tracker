using DataFetcher.Worker.Application.Providers.LocalIndicators;

namespace DataFetcher.Worker.Application.Providers.Indicators.Definitions;

public class BasicIndicatorsDefinition : IIndicatorDefinition
{
    private readonly ILocalIndicatorCalculatorService _calculatorService;

    public BasicIndicatorsDefinition(ILocalIndicatorCalculatorService calculatorService)
    {
        _calculatorService = calculatorService;
    }

    public string IndicatorName => "BasicIndicators";
    public IndicatorCategory Category => IndicatorCategory.Basic;

    public string[] OutputColumns =>
        ["sma", "ema", "macd_value", "macd_signal", "macd_histogram", "rsi"];

    public string TargetTable(string assetType) => assetType == "crypto"
        ? "analysis_indicators_crypto_free"
        : "analysis_indicators_stock_free";

    public bool AppliesTo(string assetType) => true;

    public string[] DependsOnTables => ["stock_prices", "crypto_prices"];

    public ICompletenessRule CompletenessRule =>
        new StockTradingDayRule { Cadence = DataCadence.Intraday30Min };

    public ScheduleConfig GetScheduleConfig() => new(
        ScheduleName: "Local Indicator Computation",
        Interval: TimeSpan.FromMinutes(30),
        OffsetFromBaseline: TimeSpan.FromMinutes(10),
        DependsOn: []
    );

    public async Task<BackfillResult> BackfillAsync(
        int tickerId, string symbol, DateOnly from, DateOnly to, CancellationToken ct)
    {
        // Crypto symbols use "BTC/USD" format; stock symbols are plain like "AAPL"
        var isCrypto = symbol.Contains('/');
        var result = isCrypto
            ? await _calculatorService.ComputeAllCryptoIndicatorsAsync(ct)
            : await _calculatorService.ComputeAllStockIndicatorsAsync(ct);
        return new BackfillResult(result.SuccessCount, result.SkippedCount,
            result.Errors.Count > 0 ? string.Join("; ", result.Errors) : null);
    }
}
