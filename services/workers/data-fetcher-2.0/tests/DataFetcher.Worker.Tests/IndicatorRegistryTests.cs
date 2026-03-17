using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Tests.TestData;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.LocalIndicatorCalculatorService;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class IndicatorRegistryTests
{
    private static readonly IIndicatorCalculator[] AllCalculatorInstances =
    [
        new BollingerBandsCalculator(),
        new AtrCalculator(),
        new StochasticCalculator(),
        new AdxCalculator(),
        new ObvCalculator(),
        new FibonacciCalculator(),
        new PivotPointCalculator(),
        new IchimokuCalculator(),
        new SmaCalculator(),
        new EmaCalculator(),
        new MacdCalculator(),
        new RsiCalculator()
    ];

    private static IndicatorRegistry CreateRegistry() => new(AllCalculatorInstances);

    private static IIndicatorCalculator GetCalculator(string name) =>
        AllCalculatorInstances.First(c => c.Name == name);

    private static readonly string[] DatasetNames =
        ["TrendingUp", "TrendingDown", "Volatile", "Flat", "MicroPriceCrypto"];

    public static IEnumerable<object[]> AllCalculatorData =>
        AllCalculatorInstances.Select(c => new object[] { c.Name });

    public static IEnumerable<object[]> AllCalculatorAllDatasetData
    {
        get
        {
            foreach (var calc in AllCalculatorInstances)
                foreach (var ds in DatasetNames)
                    yield return new object[] { calc.Name, ds };
        }
    }

    // ================================================================
    // Registry structure tests (1-5)
    // ================================================================

    [Fact]
    public void Registry_ContainsExactly12Calculators()
    {
        var registry = CreateRegistry();
        Assert.Equal(12, registry.GetAll().Count);
    }

    [Fact]
    public void Registry_Contains8AdvancedCalculators()
    {
        var registry = CreateRegistry();
        Assert.Equal(8, registry.GetAdvanced().Count);
    }

    [Fact]
    public void Registry_Contains4BasicCalculators()
    {
        var registry = CreateRegistry();
        Assert.Equal(4, registry.GetBasic().Count);
    }

    [Fact]
    public void Registry_NoDuplicateNames()
    {
        var registry = CreateRegistry();
        var names = registry.GetAll().Select(c => c.Name).ToList();
        Assert.Equal(names.Count, names.Distinct().Count());
    }

    [Fact]
    public void Registry_NoDuplicateOutputColumns()
    {
        var registry = CreateRegistry();
        var allColumns = registry.GetAll().SelectMany(c => c.OutputColumns).ToList();
        Assert.Equal(allColumns.Count, allColumns.Distinct().Count());
    }

    // ================================================================
    // Per-calculator compute tests (6-7)
    // ================================================================

    [Theory]
    [MemberData(nameof(AllCalculatorData))]
    public void AllCalculators_TrendingUpData_ReturnAllOutputColumns(string calculatorName)
    {
        var calculator = GetCalculator(calculatorName);
        var bars = MockOhlcvDatasets.TrendingUp;
        var result = calculator.Compute(bars);

        foreach (var col in calculator.OutputColumns)
            Assert.True(result.ContainsKey(col),
                $"{calculatorName} missing output column '{col}'");
    }

    [Theory]
    [MemberData(nameof(AllCalculatorData))]
    public void AllCalculators_TrendingUpData_AllValuesNonNull(string calculatorName)
    {
        var calculator = GetCalculator(calculatorName);
        var bars = MockOhlcvDatasets.TrendingUp;
        var result = calculator.Compute(bars);

        foreach (var col in calculator.OutputColumns)
            Assert.NotNull(result[col]);
    }

    // ================================================================
    // MinDataPoints edge case (8)
    // ================================================================

    [Theory]
    [MemberData(nameof(AllCalculatorData))]
    public void Calculator_InsufficientData_ReturnsEmptyOrNullValues(string calculatorName)
    {
        var calculator = GetCalculator(calculatorName);
        var insufficientBars = MockOhlcvDatasets.TrendingUp
            .Take(calculator.MinDataPoints - 1).ToList();

        var exception = Record.Exception(() => calculator.Compute(insufficientBars));
        Assert.Null(exception);

        var result = calculator.Compute(insufficientBars);
        foreach (var col in calculator.OutputColumns)
            Assert.True(!result.ContainsKey(col) || result[col] is null,
                $"{calculatorName} should return null for '{col}' with insufficient data");
    }

    // ================================================================
    // Monolithic parity tests (9-10)
    // ================================================================

    [Fact]
    public void AdvancedCalculators_MatchComputeAdvancedIndicators()
    {
        var bars = MockOhlcvDatasets.TrendingUp;
        var monolithic = ComputeAdvancedIndicators(bars);

        var merged = new Dictionary<string, object?>();
        foreach (var calc in AllCalculatorInstances.Where(c => c.Category == IndicatorCategory.Advanced))
            foreach (var kvp in calc.Compute(bars))
                merged[kvp.Key] = kvp.Value;

        Assert.Equal(monolithic.BollingerUpper, (decimal?)merged["bollinger_upper"]);
        Assert.Equal(monolithic.BollingerLower, (decimal?)merged["bollinger_lower"]);
        Assert.Equal(monolithic.BollingerMiddle, (decimal?)merged["bollinger_middle"]);
        Assert.Equal(monolithic.BollingerBandwidth, (decimal?)merged["bollinger_bandwidth"]);
        Assert.Equal(monolithic.Atr, (decimal?)merged["atr"]);
        Assert.Equal(monolithic.StochK, (decimal?)merged["stoch_k"]);
        Assert.Equal(monolithic.StochD, (decimal?)merged["stoch_d"]);
        Assert.Equal(monolithic.Adx, (decimal?)merged["adx"]);
        Assert.Equal(monolithic.Obv, (long?)merged["obv"]);
        Assert.Equal(monolithic.FibonacciLevels, (string?)merged["fibonacci_levels"]);
        Assert.Equal(monolithic.PivotLevels, (string?)merged["pivot_levels"]);
        Assert.Equal(monolithic.IchimokuTenkan, (decimal?)merged["ichimoku_tenkan"]);
        Assert.Equal(monolithic.IchimokuKijun, (decimal?)merged["ichimoku_kijun"]);
        Assert.Equal(monolithic.IchimokuSenkouA, (decimal?)merged["ichimoku_senkou_a"]);
        Assert.Equal(monolithic.IchimokuSenkouB, (decimal?)merged["ichimoku_senkou_b"]);
        Assert.Equal(monolithic.IchimokuChikou, (decimal?)merged["ichimoku_chikou"]);
    }

    [Fact]
    public void BasicCalculators_MatchComputeIndicators()
    {
        var bars = MockOhlcvDatasets.TrendingUp;
        var closes = MockOhlcvDatasets.GetCloses(bars);
        var monolithic = ComputeIndicators(closes);

        var merged = new Dictionary<string, object?>();
        foreach (var calc in AllCalculatorInstances.Where(c => c.Category == IndicatorCategory.Basic))
            foreach (var kvp in calc.Compute(bars))
                merged[kvp.Key] = kvp.Value;

        Assert.Equal(monolithic.Sma, (decimal?)merged["sma"]);
        Assert.Equal(monolithic.Ema, (decimal?)merged["ema"]);
        Assert.Equal(monolithic.MacdValue, (decimal?)merged["macd_value"]);
        Assert.Equal(monolithic.MacdSignal, (decimal?)merged["macd_signal"]);
        Assert.Equal(monolithic.MacdHistogram, (decimal?)merged["macd_histogram"]);
        Assert.Equal(monolithic.Rsi, (decimal?)merged["rsi"]);
    }

    // ================================================================
    // All calculators x all datasets (11)
    // ================================================================

    [Theory]
    [MemberData(nameof(AllCalculatorAllDatasetData))]
    public void AllCalculators_AllDatasets_ProduceNonNullResults(string calculatorName, string datasetName)
    {
        var calculator = GetCalculator(calculatorName);
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var result = calculator.Compute(bars);

        foreach (var col in calculator.OutputColumns)
        {
            Assert.True(result.ContainsKey(col),
                $"{calculatorName} missing '{col}' on {datasetName}");
            Assert.NotNull(result[col]);
        }
    }
}
