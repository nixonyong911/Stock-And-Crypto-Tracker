using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using Xunit;

namespace DataFetcher.Worker.Tests;

/// <summary>
/// Tests for the pure 52-week extraction in <see cref="Crypto52WeekRangeService.ComputeRange"/>.
/// </summary>
public class Crypto52WeekRangeServiceTests
{
    private static AlpacaBar Bar(string date, double high, double low) => new()
    {
        Timestamp = DateTime.Parse(date + "T00:00:00Z").ToUniversalTime(),
        Open = (high + low) / 2,
        High = high,
        Low = low,
        Close = (high + low) / 2,
        Volume = 1
    };

    [Fact]
    public void ComputeRange_PicksExtremesAndTheirDates()
    {
        var bars = new List<AlpacaBar>
        {
            Bar("2025-07-01", 102_000, 95_000),
            Bar("2025-12-15", 126_262, 110_000), // yearly high
            Bar("2026-04-10", 70_000, 59_102),   // yearly low
            Bar("2026-06-11", 105_000, 100_000),
        };

        var range = Crypto52WeekRangeService.ComputeRange(7, bars);

        Assert.NotNull(range);
        Assert.Equal(7, range!.CryptoTickerId);
        Assert.Equal(126_262m, range.Week52High);
        Assert.Equal(59_102m, range.Week52Low);
        Assert.Equal(new DateOnly(2025, 12, 15), range.Week52HighDate);
        Assert.Equal(new DateOnly(2026, 4, 10), range.Week52LowDate);
        Assert.Equal(4, range.CoverageDays);
    }

    [Fact]
    public void ComputeRange_SkipsNonPositiveBars()
    {
        var bars = new List<AlpacaBar>
        {
            Bar("2026-01-01", 0, 0),       // dropped
            Bar("2026-01-02", 50, -5),     // dropped (low <= 0)
            Bar("2026-01-03", 40, 30),
        };

        var range = Crypto52WeekRangeService.ComputeRange(1, bars);

        Assert.NotNull(range);
        Assert.Equal(40m, range!.Week52High);
        Assert.Equal(30m, range.Week52Low);
        Assert.Equal(1, range.CoverageDays);
    }

    [Fact]
    public void ComputeRange_ReturnsNullWhenNoUsableBars()
    {
        Assert.Null(Crypto52WeekRangeService.ComputeRange(1, new List<AlpacaBar>()));
        Assert.Null(Crypto52WeekRangeService.ComputeRange(1, new List<AlpacaBar> { Bar("2026-01-01", 0, 0) }));
    }

    [Fact]
    public void ComputeRange_SingleBarIsBothHighAndLow()
    {
        var range = Crypto52WeekRangeService.ComputeRange(3, new List<AlpacaBar> { Bar("2026-05-01", 12, 10) });

        Assert.NotNull(range);
        Assert.Equal(12m, range!.Week52High);
        Assert.Equal(10m, range.Week52Low);
        Assert.Equal(range.Week52HighDate, range.Week52LowDate);
    }
}
