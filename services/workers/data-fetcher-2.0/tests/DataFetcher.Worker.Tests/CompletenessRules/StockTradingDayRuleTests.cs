using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Tests.TestInfra;

namespace DataFetcher.Worker.Tests.CompletenessRules;

public class StockTradingDayRuleTests : CompletenessRuleTestBase<StockTradingDayRule>
{
    protected override StockTradingDayRule CreateRule() =>
        new() { Cadence = DataCadence.Intraday30Min };
}
