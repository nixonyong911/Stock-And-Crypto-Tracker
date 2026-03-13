using DataFetcher.Worker.Application.Providers.Fred;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class MediaValueCalculatorTests
{
    [Fact]
    public void CalculateMediaValue_RateMode_ReturnsRawValue()
    {
        var result = MediaValueCalculator.CalculateMediaValue("rate", 3.75, null, 1);
        Assert.Equal(3.75, result);
    }

    [Fact]
    public void CalculateMediaValue_YoYPct_ValidYearAgo_CalculatesCorrectPercentage()
    {
        var result = MediaValueCalculator.CalculateMediaValue("yoy_pct", 110, 100, 1);
        Assert.Equal(10.0, result);
    }

    [Fact]
    public void CalculateMediaValue_YoYPct_NullYearAgo_ReturnsNull()
    {
        var result = MediaValueCalculator.CalculateMediaValue("yoy_pct", 110, null, 1);
        Assert.Null(result);
    }

    [Fact]
    public void CalculateMediaValue_YoYPct_ZeroYearAgo_ReturnsNull()
    {
        var result = MediaValueCalculator.CalculateMediaValue("yoy_pct", 110, 0, 1);
        Assert.Null(result);
    }

    [Fact]
    public void CalculateMediaValue_TrillionsFromBillions_DividesByThousand()
    {
        var result = MediaValueCalculator.CalculateMediaValue("trillions_from_billions", 25000, null, 1);
        Assert.Equal(25.0, result);
    }

    [Fact]
    public void CalculateMediaValue_TrillionsFromMillions_DividesByMillion()
    {
        var result = MediaValueCalculator.CalculateMediaValue("trillions_from_millions", 25000000, null, 1);
        Assert.Equal(25.0, result);
    }

    [Fact]
    public void CalculateMediaValue_UnknownMode_ReturnsRawValue()
    {
        var result = MediaValueCalculator.CalculateMediaValue("something_else", 42.5, null, 1);
        Assert.Equal(42.5, result);
    }

    [Theory]
    [InlineData("yoy_pct", true)]
    [InlineData("rate", false)]
    [InlineData("trillions_from_billions", false)]
    [InlineData("trillions_from_millions", false)]
    [InlineData("unknown", false)]
    public void NeedsYearAgoData_OnlyTrueForYoYPct(string mode, bool expected)
    {
        Assert.Equal(expected, MediaValueCalculator.NeedsYearAgoData(mode));
    }
}
