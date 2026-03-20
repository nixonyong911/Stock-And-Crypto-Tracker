namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

using DataFetcher.Worker.Application.Providers.Indicators;

public class CandlestickAnalysisDefinition : IAnalysisDefinition
{
    public string AnalysisName => "CandlestickAnalysis";
    public string[] ReadsFromTables =>
    [
        "stock_prices",
        "crypto_prices"
    ];
    public string WritesToTable => "analysis_stock_candlestick_pattern";
    public string[] DependsOnIndicators => [];
}
