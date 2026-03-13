namespace DataFetcher.Worker.Domain.Providers.Fred.Entities;

public class ReleaseCalendarEntry
{
    public string SeriesId { get; set; } = string.Empty;
    public int ReleaseId { get; set; }
    public string ReleaseName { get; set; } = string.Empty;
    public DateTime? NextReleaseDate { get; set; }
    public DateTime? FollowingReleaseDate { get; set; }
    public string ReleaseFrequency { get; set; } = string.Empty;
    public string ReleaseLink { get; set; } = string.Empty;
    public DateTime LastSyncedAt { get; set; }
}
