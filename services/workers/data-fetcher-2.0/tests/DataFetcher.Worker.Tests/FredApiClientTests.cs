using DataFetcher.Worker.Domain.Providers.Fred.Models;
using DataFetcher.Worker.Infrastructure.Providers.Fred;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FredApiClientTests
{
    private static List<FredReleaseDate> BuildDates(DateTime start, int count, int dayGap)
    {
        var dates = new List<FredReleaseDate>();
        for (var i = 0; i < count; i++)
            dates.Add(new FredReleaseDate { ReleaseId = 1, Date = start.AddDays(i * dayGap) });
        return dates;
    }

    [Fact]
    public void GetReleaseFrequency_LessThanTwoDates_ReturnsUnknown()
    {
        var dates = new List<FredReleaseDate>
        {
            new() { ReleaseId = 1, Date = new DateTime(2025, 1, 1) }
        };
        Assert.Equal("Unknown", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_EmptyList_ReturnsUnknown()
    {
        Assert.Equal("Unknown", FredApiClient.GetReleaseFrequency(new List<FredReleaseDate>()));
    }

    [Fact]
    public void GetReleaseFrequency_MonthlyGaps_ReturnsMonthly()
    {
        var dates = BuildDates(new DateTime(2025, 1, 1), 6, 31);
        Assert.Equal("Monthly", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_WeeklyGaps_ReturnsWeekly()
    {
        var dates = BuildDates(new DateTime(2025, 1, 1), 6, 7);
        Assert.Equal("Weekly", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_QuarterlyGaps_ReturnsQuarterly()
    {
        var dates = BuildDates(new DateTime(2025, 1, 1), 5, 91);
        Assert.Equal("Quarterly", FredApiClient.GetReleaseFrequency(dates));
    }

    [Fact]
    public void GetReleaseFrequency_DailyGaps_ReturnsDaily()
    {
        var dates = BuildDates(new DateTime(2025, 1, 1), 10, 1);
        Assert.Equal("Daily", FredApiClient.GetReleaseFrequency(dates));
    }
}
