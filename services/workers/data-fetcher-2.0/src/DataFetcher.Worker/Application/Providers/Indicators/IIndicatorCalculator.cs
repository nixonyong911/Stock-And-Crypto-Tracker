using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public enum IndicatorCategory { Basic, Advanced, External }

public interface IIndicatorCalculator
{
    string Name { get; }
    IndicatorCategory Category { get; }
    int MinDataPoints { get; }
    string[] OutputColumns { get; }
    Dictionary<string, object?> Compute(List<OhlcvBar> bars);
}
