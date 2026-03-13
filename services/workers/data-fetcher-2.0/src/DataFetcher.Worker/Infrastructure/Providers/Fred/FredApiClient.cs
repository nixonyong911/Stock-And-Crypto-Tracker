using System.Globalization;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Fred.Models;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Providers.Fred;

public class FredApiClient : IFredApiClient
{
    private readonly HttpClient _httpClient;
    private readonly FredSettings _settings;
    private readonly ILogger<FredApiClient> _logger;

    public FredApiClient(
        HttpClient httpClient,
        IOptions<FredSettings> settings,
        ILogger<FredApiClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<FredObservation?> GetLatestObservationAsync(string seriesId, CancellationToken cancellationToken = default)
    {
        var url = $"{_settings.BaseUrl}/fred/series/observations" +
                  $"?series_id={Uri.EscapeDataString(seriesId)}" +
                  $"&api_key={Uri.EscapeDataString(_settings.ApiKey)}" +
                  $"&file_type=json&sort_order=desc&limit=1";

        var response = await _httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var apiResp = JsonSerializer.Deserialize<FredObservationsResponse>(content);

        if (apiResp?.Observations == null || apiResp.Observations.Count == 0)
        {
            _logger.LogWarning("No observations returned for series {SeriesId}", seriesId);
            return null;
        }

        var record = apiResp.Observations[0];
        return ParseObservation(record, seriesId);
    }

    public async Task<FredObservation?> GetYearAgoObservationAsync(string seriesId, DateTime currentDate, CancellationToken cancellationToken = default)
    {
        var yearAgo = currentDate.AddYears(-1);
        var startDate = yearAgo.AddMonths(-1).ToString("yyyy-MM-dd");
        var endDate = yearAgo.AddMonths(1).ToString("yyyy-MM-dd");

        var url = $"{_settings.BaseUrl}/fred/series/observations" +
                  $"?series_id={Uri.EscapeDataString(seriesId)}" +
                  $"&api_key={Uri.EscapeDataString(_settings.ApiKey)}" +
                  $"&file_type=json" +
                  $"&observation_start={startDate}" +
                  $"&observation_end={endDate}" +
                  $"&sort_order=desc";

        var response = await _httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var apiResp = JsonSerializer.Deserialize<FredObservationsResponse>(content);

        if (apiResp?.Observations == null || apiResp.Observations.Count == 0)
        {
            _logger.LogWarning("No year-ago observations for series {SeriesId}", seriesId);
            return null;
        }

        FredObservation? closest = null;
        var closestDiff = TimeSpan.FromDays(365);

        foreach (var record in apiResp.Observations)
        {
            if (record.Value == ".") continue;

            if (!DateTime.TryParseExact(record.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var obsDate))
                continue;

            if (!double.TryParse(record.Value, CultureInfo.InvariantCulture, out var value))
                continue;

            var diff = (yearAgo - obsDate).Duration();
            if (diff < closestDiff)
            {
                closestDiff = diff;
                closest = new FredObservation { Date = obsDate, Value = value };
            }
        }

        return closest;
    }

    public async Task<FredReleaseInfo?> GetSeriesReleaseAsync(string seriesId, CancellationToken cancellationToken = default)
    {
        var url = $"{_settings.BaseUrl}/fred/series/release" +
                  $"?series_id={Uri.EscapeDataString(seriesId)}" +
                  $"&api_key={Uri.EscapeDataString(_settings.ApiKey)}" +
                  $"&file_type=json";

        var response = await _httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var apiResp = JsonSerializer.Deserialize<FredSeriesReleaseResponse>(content);

        if (apiResp?.Releases == null || apiResp.Releases.Count == 0)
        {
            _logger.LogWarning("No release found for series {SeriesId}", seriesId);
            return null;
        }

        var release = apiResp.Releases[0];
        return new FredReleaseInfo
        {
            ReleaseId = release.Id,
            ReleaseName = release.Name,
            ReleaseLink = release.Link
        };
    }

    public async Task<List<FredReleaseDate>> GetReleaseDatesAsync(int releaseId, CancellationToken cancellationToken = default)
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");

        var url = $"{_settings.BaseUrl}/fred/release/dates" +
                  $"?release_id={releaseId}" +
                  $"&api_key={Uri.EscapeDataString(_settings.ApiKey)}" +
                  $"&file_type=json" +
                  $"&realtime_start={today}" +
                  $"&sort_order=asc&limit=5" +
                  $"&include_release_dates_with_no_data=true";

        var response = await _httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var apiResp = JsonSerializer.Deserialize<FredReleaseDatesResponse>(content);

        return ParseReleaseDates(apiResp);
    }

    public async Task<List<FredReleaseDate>> GetPastReleaseDatesAsync(int releaseId, CancellationToken cancellationToken = default)
    {
        var today = DateTime.UtcNow;
        var endDate = today.ToString("yyyy-MM-dd");
        var startDate = today.AddDays(-90).ToString("yyyy-MM-dd");

        var url = $"{_settings.BaseUrl}/fred/release/dates" +
                  $"?release_id={releaseId}" +
                  $"&api_key={Uri.EscapeDataString(_settings.ApiKey)}" +
                  $"&file_type=json" +
                  $"&realtime_start={startDate}" +
                  $"&realtime_end={endDate}" +
                  $"&sort_order=desc&limit=15";

        var response = await _httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var apiResp = JsonSerializer.Deserialize<FredReleaseDatesResponse>(content);

        var dates = ParseReleaseDates(apiResp);
        return dates.Where(d => d.Date <= today).ToList();
    }

    public static string GetReleaseFrequency(List<FredReleaseDate> dates)
    {
        if (dates.Count < 2) return "Unknown";

        var totalDays = 0;
        for (var i = 1; i < dates.Count; i++)
        {
            totalDays += (int)(dates[i].Date - dates[i - 1].Date).TotalDays;
        }
        var avgDays = Math.Abs(totalDays / (dates.Count - 1));

        return avgDays switch
        {
            <= 1 => "Daily",
            <= 7 => "Weekly",
            <= 14 => "Bi-weekly",
            <= 35 => "Monthly",
            <= 100 => "Quarterly",
            _ => avgDays >= 365 ? "Annual" : $"{365 / avgDays} times per year"
        };
    }

    private FredObservation? ParseObservation(FredObservationRecord record, string seriesId)
    {
        if (record.Value == ".")
        {
            _logger.LogWarning("No value available for series {SeriesId} on {Date}", seriesId, record.Date);
            return null;
        }

        if (!DateTime.TryParseExact(record.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            _logger.LogWarning("Failed to parse date {Date} for series {SeriesId}", record.Date, seriesId);
            return null;
        }

        if (!double.TryParse(record.Value, CultureInfo.InvariantCulture, out var value))
        {
            _logger.LogWarning("Failed to parse value {Value} for series {SeriesId}", record.Value, seriesId);
            return null;
        }

        return new FredObservation { Date = date, Value = value };
    }

    private static List<FredReleaseDate> ParseReleaseDates(FredReleaseDatesResponse? apiResp)
    {
        var dates = new List<FredReleaseDate>();
        if (apiResp?.ReleaseDates == null) return dates;

        foreach (var rd in apiResp.ReleaseDates)
        {
            if (DateTime.TryParseExact(rd.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                dates.Add(new FredReleaseDate { ReleaseId = rd.ReleaseId, Date = date });
            }
        }

        return dates;
    }
}
