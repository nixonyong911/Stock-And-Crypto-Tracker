namespace DataFetcher.Worker.Application.Scheduling;

public interface IScheduledJob
{
    string Name { get; }
    string[] DependsOn { get; }
    Task ExecuteAsync(CancellationToken ct);
}
