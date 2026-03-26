using System.Reflection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class HostRegistrationTests
{
    [Fact]
    public void AllBackgroundServiceTypes_AreKnown()
    {
        var assembly = typeof(Program).Assembly;

        var backgroundServiceTypes = assembly.GetTypes()
            .Where(t => t.IsClass && !t.IsAbstract && t.IsSubclassOf(typeof(BackgroundService)))
            .Select(t => t.Name)
            .OrderBy(n => n)
            .ToList();

        var expectedWorkers = new[]
        {
            "AdvancedIndicatorWorker",
            "AlpacaBackfillQueueConsumer",
            "AlpacaCryptoBackfillQueueConsumer",
            "AlpacaCryptoFetchWorker",
            "AlpacaStockFetchWorker",
            "AnalysisBackfillQueueConsumer",
            "CandlestickAnalysisWorker",
            "DataCompletenessWorker",
            "DynamicIndicatorScheduler",
            "EarningsSyncWorker",
            "EtoroFetchWorker",
            "FinnhubFetchWorker",
            "FredCalendarSyncWorker",
            "FredFetchWorker",
            "GNewsWorker",
            "LocalIndicatorWorker",
            "MarketAuxNewsWorker",
            "MassiveFetchWorker",
            "MassiveQueueConsumer",
            "PipelineOrchestratorConsumer",
            "PriceTargetWorker",
        }.OrderBy(n => n).ToList();

        Assert.Equal(expectedWorkers, backgroundServiceTypes);
    }

    [Fact]
    public void AllBackgroundServiceTypes_Count_Matches()
    {
        var assembly = typeof(Program).Assembly;

        var count = assembly.GetTypes()
            .Count(t => t.IsClass && !t.IsAbstract && t.IsSubclassOf(typeof(BackgroundService)));

        Assert.Equal(21, count);
    }

    [Theory]
    [InlineData("IAnalysisBackfillService")]
    [InlineData("ICryptoAnalysisBackfillService")]
    [InlineData("IAdvancedIndicatorCalculatorService")]
    [InlineData("ILocalIndicatorCalculatorService")]
    [InlineData("ITickerManagementService")]
    public void CoreServiceInterfaces_AreDefinedInAssembly(string interfaceName)
    {
        var assembly = typeof(Program).Assembly;

        var matchingType = assembly.GetTypes()
            .FirstOrDefault(t => t.IsInterface && t.Name == interfaceName);

        Assert.NotNull(matchingType);
    }

    [Theory]
    [InlineData("ComputeAllStockAdvancedIndicatorsAsync")]
    [InlineData("ComputeAllCryptoAdvancedIndicatorsAsync")]
    [InlineData("BackfillStockAdvancedIndicatorsAsync")]
    [InlineData("BackfillCryptoAdvancedIndicatorsAsync")]
    public void IndicatorCalculatorServices_HaveExpectedMethods(string methodName)
    {
        var assembly = typeof(Program).Assembly;

        var serviceType = assembly.GetTypes()
            .FirstOrDefault(t => t.IsInterface && t.Name == "IAdvancedIndicatorCalculatorService");

        Assert.NotNull(serviceType);

        var method = serviceType.GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance);

        Assert.NotNull(method);
    }
}
