using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using static DataFetcher.Worker.Application.Providers.PriceTargetAnalysis.PriceTargetCalculatorService;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public interface IPriceTargetCalculatorService
{
    TargetResult Calculate(
        decimal latestClose,
        IReadOnlyList<DailyClose> recentCloses,
        IndicatorSnapshot? indicators,
        IReadOnlyList<CandleSignal> recentSignals,
        PriceTargetParameters parameters,
        LongTrendSnapshot? longTrend = null);
}
