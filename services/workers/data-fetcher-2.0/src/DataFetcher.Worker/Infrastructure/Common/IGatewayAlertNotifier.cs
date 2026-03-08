namespace DataFetcher.Worker.Infrastructure.Common;

public interface IGatewayAlertNotifier
{
    Task NotifyAsync(string assetType, CancellationToken cancellationToken = default);
}
