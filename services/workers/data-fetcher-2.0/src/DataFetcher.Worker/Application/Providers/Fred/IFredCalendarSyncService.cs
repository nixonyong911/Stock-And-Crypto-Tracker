namespace DataFetcher.Worker.Application.Providers.Fred;

public interface IFredCalendarSyncService
{
    Task<(int SuccessCount, int ErrorCount)> SyncCalendarAsync(CancellationToken cancellationToken = default);
}
