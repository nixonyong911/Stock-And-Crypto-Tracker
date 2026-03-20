using DataFetcher.Worker.Application.Providers.Indicators;
using Xunit;

namespace DataFetcher.Worker.Tests.TestInfra;

public abstract class CompletenessRuleTestBase<TRule> where TRule : ICompletenessRule
{
    protected abstract TRule CreateRule();

    [Fact]
    public void Weekend_IsExpectedGap_ForStocks()
    {
        var rule = CreateRule();
        var saturday = new DateOnly(2026, 3, 14);
        Assert.True(rule.IsExpectedGap(saturday, "AAPL", "stock"));
    }

    [Fact]
    public void Sunday_IsExpectedGap_ForStocks()
    {
        var rule = CreateRule();
        var sunday = new DateOnly(2026, 3, 15);
        Assert.True(rule.IsExpectedGap(sunday, "AAPL", "stock"));
    }

    [Fact]
    public void Weekday_IsNotExpectedGap()
    {
        var rule = CreateRule();
        var monday = new DateOnly(2026, 3, 16);
        Assert.False(rule.IsExpectedGap(monday, "AAPL", "stock"));
    }

    [Theory]
    [InlineData("2026-01-01")]
    [InlineData("2026-01-19")]
    [InlineData("2026-12-25")]
    public void USHoliday_IsExpectedGap_ForStocks(string dateStr)
    {
        var rule = CreateRule();
        var date = DateOnly.Parse(dateStr);
        Assert.True(rule.IsExpectedGap(date, "AAPL", "stock"));
    }

    [Fact]
    public void ExpectedRowsPerDay_IsPositive()
    {
        var rule = CreateRule();
        var rows = rule.ExpectedRowsPerTradingDay("stock");
        Assert.True(rows > 0, "Expected rows per trading day must be positive");
    }
}
