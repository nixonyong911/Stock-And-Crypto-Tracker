using DataFetcher.Worker.Application.Providers.Indicators;
using Xunit;

namespace DataFetcher.Worker.Tests.TestInfra;

public abstract class IndicatorTestBase<TIndicator> where TIndicator : IIndicatorDefinition
{
    protected abstract TIndicator CreateIndicator();

    [Fact] public abstract Task Backfill_ProducesExpectedColumns();
    [Fact] public abstract Task Backfill_EmptyData_ReturnsGracefully();
    [Fact] public abstract Task Schedule_ConfigIsValid();
    [Fact] public abstract Task OutputColumns_MatchDatabaseSchema();
}
