namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

using DataFetcher.Worker.Application.Providers.Indicators;

public class PriceTargetAnalysisDefinition : IAnalysisDefinition
{
    public string AnalysisName => "PriceTargetAnalysis";
    public string[] ReadsFromTables =>
    [
        "analysis_stock_candlestick_pattern",
        "analysis_crypto_candlestick_pattern",
        "analysis_indicators_stock_free",
        "analysis_indicators_crypto_free"
    ];
    public string WritesToTable => "analysis_ticker_price_targets";
    public string[] DependsOnIndicators => ["BasicIndicators"];
}
