using DataFetcher.Worker.Application.Providers.LocalIndicators;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class LocalIndicatorCalculatorTests
{
    [Fact]
    public void ComputeIndicators_EmptyList_ReturnsAllNull()
    {
        var result = LocalIndicatorCalculatorService.ComputeIndicators(new List<decimal>());

        Assert.Null(result.Sma);
        Assert.Null(result.Ema);
        Assert.Null(result.MacdValue);
        Assert.Null(result.MacdSignal);
        Assert.Null(result.MacdHistogram);
        Assert.Null(result.Rsi);
    }

    [Fact]
    public void ComputeIndicators_LessThan14Points_ReturnsNullRsi()
    {
        var closes = Enumerable.Range(1, 13).Select(i => (decimal)i).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.Null(result.Rsi);
    }

    [Fact]
    public void ComputeIndicators_Exactly20Points_ReturnsSmaAndEma()
    {
        var closes = Enumerable.Range(1, 20).Select(i => (decimal)(100 + i)).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Sma);
        Assert.NotNull(result.Ema);

        var expectedSma = closes.Average();
        Assert.Equal(Math.Round(expectedSma, 6), result.Sma);
    }

    [Fact]
    public void ComputeIndicators_SmaIsSimpleAverage()
    {
        var closes = new List<decimal> { 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                                          20, 21, 22, 23, 24, 25, 26, 27, 28, 29 };
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        var expectedSma = closes.Average();
        Assert.Equal(Math.Round(expectedSma, 6), result.Sma);
    }

    [Fact]
    public void ComputeIndicators_40Points_ReturnsAllIndicators()
    {
        var closes = GenerateRealisticCloses(40, 150m, 0.02m);
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Sma);
        Assert.NotNull(result.Ema);
        Assert.NotNull(result.MacdValue);
        Assert.NotNull(result.MacdSignal);
        Assert.NotNull(result.MacdHistogram);
        Assert.NotNull(result.Rsi);
    }

    [Fact]
    public void ComputeIndicators_Rsi_Between0And100()
    {
        var closes = GenerateRealisticCloses(30, 100m, 0.03m);
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Rsi);
        Assert.InRange(result.Rsi.Value, 0m, 100m);
    }

    [Fact]
    public void ComputeIndicators_Rsi_StrongUptrend_HighRsi()
    {
        var closes = Enumerable.Range(0, 30).Select(i => 100m + i * 2m).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Rsi);
        Assert.True(result.Rsi > 80m, $"RSI for strong uptrend should be > 80, got {result.Rsi}");
    }

    [Fact]
    public void ComputeIndicators_Rsi_StrongDowntrend_LowRsi()
    {
        var closes = Enumerable.Range(0, 30).Select(i => 200m - i * 2m).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.Rsi);
        Assert.True(result.Rsi < 20m, $"RSI for strong downtrend should be < 20, got {result.Rsi}");
    }

    [Fact]
    public void ComputeIndicators_MacdHistogram_EqualsValueMinusSignal()
    {
        var closes = GenerateRealisticCloses(40, 150m, 0.015m);
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.NotNull(result.MacdValue);
        Assert.NotNull(result.MacdSignal);
        Assert.NotNull(result.MacdHistogram);

        var expectedHist = Math.Round(result.MacdValue.Value - result.MacdSignal.Value, 6);
        Assert.Equal(expectedHist, result.MacdHistogram);
    }

    [Fact]
    public void ComputeIndicators_EmaRespondsToRecentPriceChanges()
    {
        var stableCloses = Enumerable.Repeat(100m, 25).ToList();
        var resultStable = LocalIndicatorCalculatorService.ComputeIndicators(stableCloses);

        var risingCloses = new List<decimal>(stableCloses);
        risingCloses[^1] = 110m;
        risingCloses[^2] = 108m;
        risingCloses[^3] = 106m;
        var resultRising = LocalIndicatorCalculatorService.ComputeIndicators(risingCloses);

        Assert.True(resultRising.Ema > resultStable.Ema,
            $"EMA with rising prices ({resultRising.Ema}) should be higher than stable ({resultStable.Ema})");
    }

    [Fact]
    public void ComputeIndicators_LessThan26Points_NoMacd()
    {
        var closes = GenerateRealisticCloses(25, 100m, 0.01m);
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.Null(result.MacdValue);
    }

    [Fact]
    public void ComputeIndicators_LessThan20Points_NoSma()
    {
        var closes = GenerateRealisticCloses(19, 100m, 0.01m);
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.Null(result.Sma);
    }

    [Fact]
    public void ComputeIndicators_ConstantPrices_ZeroMacdAndMidRsi()
    {
        var closes = Enumerable.Repeat(100m, 40).ToList();
        var result = LocalIndicatorCalculatorService.ComputeIndicators(closes);

        Assert.Equal(100m, result.Sma);
        Assert.Equal(0m, result.MacdValue);
        Assert.Equal(0m, result.MacdHistogram);
    }

    private static List<decimal> GenerateRealisticCloses(int count, decimal startPrice, decimal volatility)
    {
        var closes = new List<decimal>(count);
        var price = startPrice;
        var rng = new Random(42);

        for (int i = 0; i < count; i++)
        {
            price += price * volatility * (decimal)(rng.NextDouble() * 2 - 1);
            if (price <= 0) price = 0.01m;
            closes.Add(Math.Round(price, 4));
        }

        return closes;
    }
}
