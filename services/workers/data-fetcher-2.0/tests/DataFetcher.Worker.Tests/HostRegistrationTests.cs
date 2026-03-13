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
            "AlpacaBackfillQueueConsumer",
            "AlpacaCryptoBackfillQueueConsumer",
            "AlpacaCryptoFetchWorker",
            "AlpacaStockFetchWorker",
            "AnalysisBackfillQueueConsumer",
            "CandlestickAnalysisWorker",
            "EarningsSyncWorker",
            "FinnhubFetchWorker",
            "FredCalendarSyncWorker",
            "FredFetchWorker",
            "LocalIndicatorWorker",
            "MarketAuxNewsWorker",
            "MassiveFetchWorker",
            "MassiveQueueConsumer",
            "PriceTargetWorker",
        }.OrderBy(n => n).ToList();

        Assert.Equal(expectedWorkers, backgroundServiceTypes);
    }
}
