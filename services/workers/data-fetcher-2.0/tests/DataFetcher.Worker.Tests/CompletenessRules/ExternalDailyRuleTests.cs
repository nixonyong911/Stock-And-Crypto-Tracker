using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Tests.TestInfra;

namespace DataFetcher.Worker.Tests.CompletenessRules;

public class ExternalDailyRuleTests : CompletenessRuleTestBase<ExternalDailyRule>
{
    protected override ExternalDailyRule CreateRule() => new();
}
