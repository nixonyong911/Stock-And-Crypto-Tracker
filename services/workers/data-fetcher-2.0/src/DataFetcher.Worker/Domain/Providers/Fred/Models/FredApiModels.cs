using System.Text.Json.Serialization;

namespace DataFetcher.Worker.Domain.Providers.Fred.Models;

public class FredObservationsResponse
{
    [JsonPropertyName("realtime_start")]
    public string? RealtimeStart { get; set; }

    [JsonPropertyName("realtime_end")]
    public string? RealtimeEnd { get; set; }

    [JsonPropertyName("observation_start")]
    public string? ObservationStart { get; set; }

    [JsonPropertyName("observation_end")]
    public string? ObservationEnd { get; set; }

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("observations")]
    public List<FredObservationRecord> Observations { get; set; } = new();
}

public class FredObservationRecord
{
    [JsonPropertyName("realtime_start")]
    public string? RealtimeStart { get; set; }

    [JsonPropertyName("realtime_end")]
    public string? RealtimeEnd { get; set; }

    [JsonPropertyName("date")]
    public string Date { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;
}

public class FredSeriesReleaseResponse
{
    [JsonPropertyName("releases")]
    public List<FredReleaseRecord> Releases { get; set; } = new();
}

public class FredReleaseRecord
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("link")]
    public string? Link { get; set; }
}

public class FredReleaseDatesResponse
{
    [JsonPropertyName("release_dates")]
    public List<FredReleaseDateRecord> ReleaseDates { get; set; } = new();
}

public class FredReleaseDateRecord
{
    [JsonPropertyName("release_id")]
    public int ReleaseId { get; set; }

    [JsonPropertyName("date")]
    public string Date { get; set; } = string.Empty;
}

public class FredObservation
{
    public DateTime Date { get; set; }
    public double Value { get; set; }
}

public class FredReleaseInfo
{
    public int ReleaseId { get; set; }
    public string ReleaseName { get; set; } = string.Empty;
    public string? ReleaseLink { get; set; }
}

public class FredReleaseDate
{
    public int ReleaseId { get; set; }
    public DateTime Date { get; set; }
}
