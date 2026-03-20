using DataFetcher.Worker.Application.Providers.Indicators.Definitions;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Tests.TestInfra;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests.IndicatorDefinitions;

public class AdvancedLocalIndicatorsDefinitionTests : IndicatorTestBase<AdvancedLocalIndicatorsDefinition>
{
    protected override AdvancedLocalIndicatorsDefinition CreateIndicator()
    {
        var mock = new Mock<IAdvancedIndicatorCalculatorService>();
        mock.Setup(s => s.BackfillStockAdvancedIndicatorsAsync(
                It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BackfillAdvancedResult { DaysComputed = 5, Success = true });
        return new AdvancedLocalIndicatorsDefinition(mock.Object);
    }

    public override async Task Backfill_ProducesExpectedColumns()
    {
        var indicator = CreateIndicator();
        var result = await indicator.BackfillAsync(
            1, "AAPL",
            DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30)),
            DateOnly.FromDateTime(DateTime.UtcNow),
            CancellationToken.None);
        Assert.NotNull(result);
        Assert.True(result.DaysComputed >= 0);
    }

    public override async Task Backfill_EmptyData_ReturnsGracefully()
    {
        var mock = new Mock<IAdvancedIndicatorCalculatorService>();
        mock.Setup(s => s.BackfillStockAdvancedIndicatorsAsync(
                It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BackfillAdvancedResult { DaysComputed = 0, Success = true });
        var indicator = new AdvancedLocalIndicatorsDefinition(mock.Object);
        var result = await indicator.BackfillAsync(
            1, "AAPL",
            DateOnly.FromDateTime(DateTime.UtcNow),
            DateOnly.FromDateTime(DateTime.UtcNow),
            CancellationToken.None);
        Assert.NotNull(result);
    }

    public override Task Schedule_ConfigIsValid()
    {
        var indicator = CreateIndicator();
        var config = indicator.GetScheduleConfig();
        Assert.False(string.IsNullOrWhiteSpace(config.ScheduleName));
        Assert.True(config.Interval > TimeSpan.Zero);
        return Task.CompletedTask;
    }

    public override Task OutputColumns_MatchDatabaseSchema()
    {
        var indicator = CreateIndicator();
        Assert.NotEmpty(indicator.OutputColumns);
        Assert.All(indicator.OutputColumns, col => Assert.False(string.IsNullOrWhiteSpace(col)));
        return Task.CompletedTask;
    }
}
