namespace DataFetcher.Worker.Infrastructure.Common;

public interface IPipelineEventPublisher
{
    void PublishOhlcvComplete(string assetType, int tickerCount, int recordCount);
    void PublishAnalysisComplete(string assetType, int priceTargetsComputed);
}
