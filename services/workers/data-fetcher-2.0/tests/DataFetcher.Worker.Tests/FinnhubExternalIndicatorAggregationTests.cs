using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubExternalIndicatorAggregationTests
{
    [Fact]
    public void AggregateInsiders_MixedTransactions_CorrectCounts()
    {
        var transactions = new List<InsiderTransaction>
        {
            new() { TransactionCode = "P", Change = 1000, TransactionPrice = 150m,
                     TransactionDate = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd"), IsDerivative = false },
            new() { TransactionCode = "P", Change = 500, TransactionPrice = 155m,
                     TransactionDate = DateTime.UtcNow.AddDays(-20).ToString("yyyy-MM-dd"), IsDerivative = false },
            new() { TransactionCode = "S", Change = -2000, TransactionPrice = 160m,
                     TransactionDate = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-dd"), IsDerivative = false },
        };
        var (buyCount, sellCount, netShares, _) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(transactions);
        Assert.Equal(2, buyCount);
        Assert.Equal(1, sellCount);
        Assert.Equal(-500, netShares);
    }

    [Fact]
    public void AggregateInsiders_IgnoresDerivativesAndGifts()
    {
        var transactions = new List<InsiderTransaction>
        {
            new() { TransactionCode = "G", Change = -1000, TransactionPrice = 0,
                     TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = false },
            new() { TransactionCode = "A", Change = 1000, TransactionPrice = 0,
                     TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = true },
            new() { TransactionCode = "P", Change = 500, TransactionPrice = 100m,
                     TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = false },
        };
        var (buyCount, sellCount, _, _) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(transactions);
        Assert.Equal(1, buyCount);
        Assert.Equal(0, sellCount);
    }

    [Fact]
    public void AggregateInsiders_FiltersOlderThan90Days()
    {
        var transactions = new List<InsiderTransaction>
        {
            new() { TransactionCode = "P", Change = 1000, TransactionPrice = 100m,
                     TransactionDate = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-dd"), IsDerivative = false },
            new() { TransactionCode = "P", Change = 500, TransactionPrice = 100m,
                     TransactionDate = DateTime.UtcNow.AddDays(-120).ToString("yyyy-MM-dd"), IsDerivative = false },
        };
        var (buyCount, _, _, _) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(transactions);
        Assert.Equal(1, buyCount);
    }

    [Fact]
    public void AggregateInsiders_Null_ReturnsZeros()
    {
        var (b, s, n, v) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(null);
        Assert.Equal(0, b); Assert.Equal(0, s); Assert.Equal(0, n); Assert.Equal(0m, v);
    }

    [Fact]
    public void AggregateInsiders_EmptyList_ReturnsZeros()
    {
        var (b, s, _, _) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(new List<InsiderTransaction>());
        Assert.Equal(0, b); Assert.Equal(0, s);
    }

    [Fact]
    public void AggregateInsiderSentiment_LatestMonth()
    {
        var data = new List<InsiderSentimentData>
        {
            new() { Year = 2026, Month = 2, Change = 6732, Mspr = 25.65m },
            new() { Year = 2026, Month = 1, Change = -1000, Mspr = -50m },
            new() { Year = 2025, Month = 12, Change = 500, Mspr = 10m },
        };
        var (mspr, change) = FinnhubExternalIndicatorService.AggregateInsiderSentiment(data);
        Assert.Equal(25.65m, mspr);
        Assert.Equal(6732, change);
    }

    [Fact]
    public void AggregateInsiderSentiment_Null_ReturnsNulls()
    {
        var (mspr, change) = FinnhubExternalIndicatorService.AggregateInsiderSentiment(null);
        Assert.Null(mspr); Assert.Null(change);
    }

    [Fact]
    public void AggregateRecommendations_LatestPeriod()
    {
        var trends = new List<RecommendationTrend>
        {
            new() { Period = "2026-03-01", StrongBuy = 14, Buy = 22, Hold = 16, Sell = 2, StrongSell = 0 },
            new() { Period = "2026-02-01", StrongBuy = 14, Buy = 21, Hold = 17, Sell = 2, StrongSell = 0 },
        };
        var result = FinnhubExternalIndicatorService.AggregateRecommendations(trends);
        Assert.Equal(14, result.StrongBuy);
        Assert.Equal(22, result.Buy);
        Assert.Equal(16, result.Hold);
    }

    [Fact]
    public void AggregateRecommendations_Null_AllZeros()
    {
        var result = FinnhubExternalIndicatorService.AggregateRecommendations(null);
        Assert.Equal(0, result.StrongBuy); Assert.Equal(0, result.Buy);
    }

    [Fact]
    public void DeriveConsensus_MostlyBuys_ReturnsBuy()
    {
        Assert.Equal("buy", FinnhubExternalIndicatorService.DeriveConsensus(14, 22, 16, 2, 0));
    }

    [Fact]
    public void DeriveConsensus_AllStrongBuy_ReturnsStrongBuy()
    {
        Assert.Equal("strong_buy", FinnhubExternalIndicatorService.DeriveConsensus(30, 5, 0, 0, 0));
    }

    [Fact]
    public void DeriveConsensus_MostlyHold_ReturnsHold()
    {
        Assert.Equal("hold", FinnhubExternalIndicatorService.DeriveConsensus(2, 3, 25, 3, 2));
    }

    [Fact]
    public void DeriveConsensus_MostlySell_ReturnsSell()
    {
        Assert.Equal("sell", FinnhubExternalIndicatorService.DeriveConsensus(0, 1, 3, 20, 5));
    }

    [Fact]
    public void DeriveConsensus_AllZeros_ReturnsNull()
    {
        Assert.Null(FinnhubExternalIndicatorService.DeriveConsensus(0, 0, 0, 0, 0));
    }
}
