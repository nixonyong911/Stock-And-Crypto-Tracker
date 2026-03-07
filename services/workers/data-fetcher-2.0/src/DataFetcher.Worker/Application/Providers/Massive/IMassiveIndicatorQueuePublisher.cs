namespace DataFetcher.Worker.Application.Providers.Massive;

public interface IMassiveIndicatorQueuePublisher
{
    void PublishBackfill(string symbol, int tickerId, string assetType, int days = 90);
}
