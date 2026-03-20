using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Application.Providers.Indicators.Definitions;
using DataFetcher.Worker.Tests.TestInfra;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests.IndicatorDefinitions;

public class ExternalFinnhubIndicatorsDefinitionTests : IndicatorTestBase<ExternalFinnhubIndicatorsDefinition>
{
    protected override ExternalFinnhubIndicatorsDefinition CreateIndicator()
    {
        var mock = new Mock<IFinnhubExternalIndicatorService>();
        mock.Setup(s => s.FetchStockExternalIndicatorsAsync(
                It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return new ExternalFinnhubIndicatorsDefinition(mock.Object);
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
        Assert.Equal(1, result.DaysComputed);
    }

    public override async Task Backfill_EmptyData_ReturnsGracefully()
    {
        var mock = new Mock<IFinnhubExternalIndicatorService>();
        mock.Setup(s => s.FetchStockExternalIndicatorsAsync(
                It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var indicator = new ExternalFinnhubIndicatorsDefinition(mock.Object);
        var result = await indicator.BackfillAsync(
            1, "AAPL",
            DateOnly.FromDateTime(DateTime.UtcNow),
            DateOnly.FromDateTime(DateTime.UtcNow),
            CancellationToken.None);
        Assert.NotNull(result);
        Assert.Equal(0, result.DaysComputed);
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
