using DataFetcher.Worker.Domain.Providers.Fred.Models;

namespace DataFetcher.Worker.Application.Providers.Fred;

public interface IFredApiClient
{
    Task<FredObservation?> GetLatestObservationAsync(string seriesId, CancellationToken cancellationToken = default);
    Task<FredObservation?> GetYearAgoObservationAsync(string seriesId, DateTime currentDate, CancellationToken cancellationToken = default);
    Task<FredReleaseInfo?> GetSeriesReleaseAsync(string seriesId, CancellationToken cancellationToken = default);
    Task<List<FredReleaseDate>> GetReleaseDatesAsync(int releaseId, CancellationToken cancellationToken = default);
    Task<List<FredReleaseDate>> GetPastReleaseDatesAsync(int releaseId, CancellationToken cancellationToken = default);
}
