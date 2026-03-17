using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.LocalIndicatorCalculatorService;

namespace DataFetcher.Worker.Tests.TestData;

/// <summary>
/// Lazily computed golden-reference values from the CURRENT implementation.
/// Used to detect regressions: if a refactored implementation produces different
/// values for the same deterministic input, these cached snapshots reveal the drift.
///
/// The parity tests in <see cref="GoldenReferenceTests"/> are the primary safety net.
/// This class supplements them by caching per-dataset outputs for future snapshot comparison.
/// </summary>
internal static class GoldenReferenceValues
{
    private static readonly Lazy<Dictionary<string, AdvancedIndicatorSet>> AdvancedCache = new(() =>
    {
        var datasets = new[]
        {
            (nameof(MockOhlcvDatasets.TrendingUp), MockOhlcvDatasets.TrendingUp),
            (nameof(MockOhlcvDatasets.TrendingDown), MockOhlcvDatasets.TrendingDown),
            (nameof(MockOhlcvDatasets.Volatile), MockOhlcvDatasets.Volatile),
            (nameof(MockOhlcvDatasets.Flat), MockOhlcvDatasets.Flat),
            (nameof(MockOhlcvDatasets.MicroPriceCrypto), MockOhlcvDatasets.MicroPriceCrypto),
        };

        return datasets.ToDictionary(
            d => d.Item1,
            d => ComputeAdvancedIndicators(d.Item2));
    });

    private static readonly Lazy<Dictionary<string, IndicatorSet>> BasicCache = new(() =>
    {
        var datasets = new[]
        {
            (nameof(MockOhlcvDatasets.TrendingUp), MockOhlcvDatasets.TrendingUp),
            (nameof(MockOhlcvDatasets.TrendingDown), MockOhlcvDatasets.TrendingDown),
            (nameof(MockOhlcvDatasets.Volatile), MockOhlcvDatasets.Volatile),
            (nameof(MockOhlcvDatasets.Flat), MockOhlcvDatasets.Flat),
            (nameof(MockOhlcvDatasets.MicroPriceCrypto), MockOhlcvDatasets.MicroPriceCrypto),
        };

        return datasets.ToDictionary(
            d => d.Item1,
            d => ComputeIndicators(MockOhlcvDatasets.GetCloses(d.Item2)));
    });

    public static AdvancedIndicatorSet GetAdvanced(string datasetName) => AdvancedCache.Value[datasetName];
    public static IndicatorSet GetBasic(string datasetName) => BasicCache.Value[datasetName];
}
