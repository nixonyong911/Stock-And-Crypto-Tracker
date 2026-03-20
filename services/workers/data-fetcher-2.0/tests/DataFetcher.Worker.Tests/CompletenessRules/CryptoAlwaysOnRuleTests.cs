using DataFetcher.Worker.Application.Providers.Indicators;
using Xunit;

namespace DataFetcher.Worker.Tests.CompletenessRules;

public class CryptoAlwaysOnRuleTests
{
    private readonly CryptoAlwaysOnRule _rule = new() { Cadence = DataCadence.Intraday30Min };

    [Fact]
    public void Weekend_IsNotExpectedGap_ForCrypto()
    {
        var saturday = new DateOnly(2026, 3, 14);
        Assert.False(_rule.IsExpectedGap(saturday, "BTC/USD", "crypto"));
    }

    [Fact]
    public void Holiday_IsNotExpectedGap_ForCrypto()
    {
        var christmas = new DateOnly(2026, 12, 25);
        Assert.False(_rule.IsExpectedGap(christmas, "ETH/USD", "crypto"));
    }

    [Fact]
    public void NeverHasGaps()
    {
        for (var d = new DateOnly(2026, 1, 1); d <= new DateOnly(2026, 12, 31); d = d.AddDays(1))
            Assert.False(_rule.IsExpectedGap(d, "BTC/USD", "crypto"));
    }

    [Fact]
    public void ExpectedRowsPerDay_IsPositive()
    {
        Assert.True(_rule.ExpectedRowsPerTradingDay("crypto") > 0);
    }

    [Fact]
    public void Intraday30Min_Returns48RowsPerDay()
    {
        Assert.Equal(48, _rule.ExpectedRowsPerTradingDay("crypto"));
    }
}
