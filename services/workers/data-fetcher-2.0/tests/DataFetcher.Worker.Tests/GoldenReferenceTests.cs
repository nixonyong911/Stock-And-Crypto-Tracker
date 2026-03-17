using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Tests.TestData;
using Xunit;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.LocalIndicatorCalculatorService;

namespace DataFetcher.Worker.Tests;

public class GoldenReferenceTests
{
    public static IEnumerable<object[]> DatasetNames => new[]
    {
        new object[] { nameof(MockOhlcvDatasets.TrendingUp) },
        new object[] { nameof(MockOhlcvDatasets.TrendingDown) },
        new object[] { nameof(MockOhlcvDatasets.Volatile) },
        new object[] { nameof(MockOhlcvDatasets.Flat) },
        new object[] { nameof(MockOhlcvDatasets.MicroPriceCrypto) },
    };

    // ================================================================
    // Advanced Indicator Golden Reference (all fields populated)
    // ================================================================

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void AdvancedIndicators_AllFieldsPopulated(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var result = ComputeAdvancedIndicators(bars);

        Assert.NotNull(result.BollingerUpper);
        Assert.NotNull(result.BollingerLower);
        Assert.NotNull(result.BollingerMiddle);
        Assert.NotNull(result.BollingerBandwidth);
        Assert.NotNull(result.Atr);
        Assert.NotNull(result.StochK);
        Assert.NotNull(result.StochD);
        Assert.NotNull(result.Adx);
        Assert.NotNull(result.Obv);
        Assert.NotNull(result.FibonacciLevels);
        Assert.NotNull(result.PivotLevels);
        Assert.NotNull(result.IchimokuTenkan);
        Assert.NotNull(result.IchimokuKijun);
        Assert.NotNull(result.IchimokuSenkouA);
        Assert.NotNull(result.IchimokuSenkouB);
        Assert.NotNull(result.IchimokuChikou);
    }

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void AdvancedIndicators_Idempotent(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var first = ComputeAdvancedIndicators(bars);
        var second = ComputeAdvancedIndicators(bars);

        AssertAdvancedSetsEqual(first, second, datasetName);
    }

    // ================================================================
    // Basic Indicator Golden Reference (all fields populated)
    // ================================================================

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void BasicIndicators_AllFieldsPopulated(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var closes = MockOhlcvDatasets.GetCloses(bars);
        var result = ComputeIndicators(closes);

        Assert.NotNull(result.Sma);
        Assert.NotNull(result.Ema);
        Assert.NotNull(result.MacdValue);
        Assert.NotNull(result.MacdSignal);
        Assert.NotNull(result.MacdHistogram);
        Assert.NotNull(result.Rsi);
    }

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void BasicIndicators_Idempotent(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var closes = MockOhlcvDatasets.GetCloses(bars);
        var first = ComputeIndicators(closes);
        var second = ComputeIndicators(closes);

        Assert.Equal(first.Sma, second.Sma);
        Assert.Equal(first.Ema, second.Ema);
        Assert.Equal(first.MacdValue, second.MacdValue);
        Assert.Equal(first.MacdSignal, second.MacdSignal);
        Assert.Equal(first.MacdHistogram, second.MacdHistogram);
        Assert.Equal(first.Rsi, second.Rsi);
    }

    // ================================================================
    // CRITICAL: Backfill vs Scheduled Parity
    // Proves that ComputeBackfillIndicators' last entry matches
    // a single ComputeAdvancedIndicators call on the same full window.
    // ================================================================

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void BackfillVsScheduled_LastDayMatchesSingleInvocation(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);

        var backfillResults = ComputeBackfillIndicators(bars);
        var singleResult = ComputeAdvancedIndicators(bars);

        Assert.NotEmpty(backfillResults);
        var lastBackfill = backfillResults[^1].Set;

        AssertAdvancedSetsEqual(singleResult, lastBackfill, $"{datasetName} (backfill-last vs single)");
    }

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void BackfillVsScheduled_LastDayDateMatchesLastBar(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var backfillResults = ComputeBackfillIndicators(bars);

        Assert.Equal(bars[^1].Date, backfillResults[^1].Date);
    }

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void BackfillVsScheduled_AllDaysChronological(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var backfillResults = ComputeBackfillIndicators(bars);

        for (int i = 1; i < backfillResults.Count; i++)
        {
            Assert.True(backfillResults[i].Date > backfillResults[i - 1].Date,
                $"{datasetName}: date at index {i} ({backfillResults[i].Date:d}) should follow {i - 1} ({backfillResults[i - 1].Date:d})");
        }
    }

    // ================================================================
    // Basic Indicator Parity: Full vs Subset
    // Both 60-bar and 50-bar windows produce non-null indicators.
    // ================================================================

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void BasicIndicators_FullVsSubset_BothPopulated(string datasetName)
    {
        var bars = MockOhlcvDatasets.GetByName(datasetName);
        var closes = MockOhlcvDatasets.GetCloses(bars);

        var fullResult = ComputeIndicators(closes);
        var subsetResult = ComputeIndicators(closes.TakeLast(50).ToList());

        Assert.NotNull(fullResult.Sma);
        Assert.NotNull(fullResult.Ema);
        Assert.NotNull(fullResult.MacdValue);
        Assert.NotNull(fullResult.MacdSignal);
        Assert.NotNull(fullResult.MacdHistogram);
        Assert.NotNull(fullResult.Rsi);

        Assert.NotNull(subsetResult.Sma);
        Assert.NotNull(subsetResult.Ema);
        Assert.NotNull(subsetResult.MacdValue);
        Assert.NotNull(subsetResult.MacdSignal);
        Assert.NotNull(subsetResult.MacdHistogram);
        Assert.NotNull(subsetResult.Rsi);
    }

    // ================================================================
    // Cached golden-reference stability
    // Verifies GoldenReferenceValues cache matches a fresh computation.
    // ================================================================

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void GoldenCache_AdvancedMatchesFreshComputation(string datasetName)
    {
        var cached = GoldenReferenceValues.GetAdvanced(datasetName);
        var fresh = ComputeAdvancedIndicators(MockOhlcvDatasets.GetByName(datasetName));

        AssertAdvancedSetsEqual(cached, fresh, $"{datasetName} (cached vs fresh)");
    }

    [Theory]
    [MemberData(nameof(DatasetNames))]
    public void GoldenCache_BasicMatchesFreshComputation(string datasetName)
    {
        var cached = GoldenReferenceValues.GetBasic(datasetName);
        var closes = MockOhlcvDatasets.GetCloses(MockOhlcvDatasets.GetByName(datasetName));
        var fresh = ComputeIndicators(closes);

        Assert.Equal(cached.Sma, fresh.Sma);
        Assert.Equal(cached.Ema, fresh.Ema);
        Assert.Equal(cached.MacdValue, fresh.MacdValue);
        Assert.Equal(cached.MacdSignal, fresh.MacdSignal);
        Assert.Equal(cached.MacdHistogram, fresh.MacdHistogram);
        Assert.Equal(cached.Rsi, fresh.Rsi);
    }

    // ================================================================
    // Helpers
    // ================================================================

    private static void AssertAdvancedSetsEqual(
        AdvancedIndicatorSet expected, AdvancedIndicatorSet actual, string context)
    {
        Assert.Equal(expected.BollingerUpper, actual.BollingerUpper);
        Assert.Equal(expected.BollingerLower, actual.BollingerLower);
        Assert.Equal(expected.BollingerMiddle, actual.BollingerMiddle);
        Assert.Equal(expected.BollingerBandwidth, actual.BollingerBandwidth);
        Assert.Equal(expected.Atr, actual.Atr);
        Assert.Equal(expected.StochK, actual.StochK);
        Assert.Equal(expected.StochD, actual.StochD);
        Assert.Equal(expected.Adx, actual.Adx);
        Assert.Equal(expected.Obv, actual.Obv);
        Assert.Equal(expected.FibonacciLevels, actual.FibonacciLevels);
        Assert.Equal(expected.PivotLevels, actual.PivotLevels);
        Assert.Equal(expected.IchimokuTenkan, actual.IchimokuTenkan);
        Assert.Equal(expected.IchimokuKijun, actual.IchimokuKijun);
        Assert.Equal(expected.IchimokuSenkouA, actual.IchimokuSenkouA);
        Assert.Equal(expected.IchimokuSenkouB, actual.IchimokuSenkouB);
        Assert.Equal(expected.IchimokuChikou, actual.IchimokuChikou);
    }
}
