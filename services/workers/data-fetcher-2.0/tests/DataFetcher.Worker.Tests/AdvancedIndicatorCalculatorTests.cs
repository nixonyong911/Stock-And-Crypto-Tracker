using DataFetcher.Worker.Application.Providers.LocalIndicators;
using Xunit;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Tests;

public class AdvancedIndicatorCalculatorTests
{
    // ================================================================
    // Bollinger Bands
    // ================================================================

    [Fact]
    public void BollingerBands_ConstantPrices_ZeroBandwidth()
    {
        var closes = Enumerable.Repeat(100m, 20).ToList();
        var result = ComputeBollingerBands(closes, 20, 2.0m);

        Assert.Equal(100m, result.Middle);
        Assert.Equal(100m, result.Upper);
        Assert.Equal(100m, result.Lower);
        Assert.Equal(0m, result.Bandwidth);
    }

    [Fact]
    public void BollingerBands_MiddleIsSma()
    {
        var closes = Enumerable.Range(1, 20).Select(i => (decimal)(100 + i)).ToList();
        var result = ComputeBollingerBands(closes, 20, 2.0m);

        var expectedSma = Math.Round(closes.Average(), 6);
        Assert.Equal(expectedSma, result.Middle);
        Assert.True(result.Upper > result.Middle);
        Assert.True(result.Lower < result.Middle);
    }

    [Fact]
    public void BollingerBands_UpperAboveLower()
    {
        var bars = GenerateOhlcvBars(30, 150m, 0.02m);
        var closes = bars.Select(b => b.Close).ToList();
        var result = ComputeBollingerBands(closes, 20, 2.0m);

        Assert.True(result.Upper > result.Lower);
        Assert.True(result.Bandwidth > 0);
    }

    // ================================================================
    // ATR
    // ================================================================

    [Fact]
    public void Atr_PositiveForVolatileData()
    {
        var bars = GenerateOhlcvBars(20, 100m, 0.03m);
        var highs = bars.Select(b => b.High).ToList();
        var lows = bars.Select(b => b.Low).ToList();
        var closes = bars.Select(b => b.Close).ToList();

        var atr = ComputeAtr(highs, lows, closes, 14);
        Assert.True(atr > 0, $"ATR should be positive for volatile data, got {atr}");
    }

    [Fact]
    public void Atr_ZeroForFlatData()
    {
        var highs = Enumerable.Repeat(100m, 20).ToList();
        var lows = Enumerable.Repeat(100m, 20).ToList();
        var closes = Enumerable.Repeat(100m, 20).ToList();

        var atr = ComputeAtr(highs, lows, closes, 14);
        Assert.Equal(0m, atr);
    }

    // ================================================================
    // Stochastic
    // ================================================================

    [Fact]
    public void Stochastic_StrongUptrend_HighK()
    {
        var bars = Enumerable.Range(0, 20).Select(i => new OhlcvBar
        {
            Open = 100m + i * 2m,
            High = 102m + i * 2m,
            Low = 99m + i * 2m,
            Close = 101m + i * 2m,
            Volume = 1000,
            Date = DateTime.Today.AddDays(-20 + i)
        }).ToList();

        var result = ComputeStochastic(
            bars.Select(b => b.High).ToList(),
            bars.Select(b => b.Low).ToList(),
            bars.Select(b => b.Close).ToList(),
            14, 3);

        Assert.True(result.K > 70m, $"Stochastic %K should be high in uptrend, got {result.K}");
    }

    [Fact]
    public void Stochastic_StrongDowntrend_LowK()
    {
        var bars = Enumerable.Range(0, 20).Select(i => new OhlcvBar
        {
            Open = 200m - i * 2m,
            High = 202m - i * 2m,
            Low = 199m - i * 2m,
            Close = 199.5m - i * 2m,
            Volume = 1000,
            Date = DateTime.Today.AddDays(-20 + i)
        }).ToList();

        var result = ComputeStochastic(
            bars.Select(b => b.High).ToList(),
            bars.Select(b => b.Low).ToList(),
            bars.Select(b => b.Close).ToList(),
            14, 3);

        Assert.True(result.K < 30m, $"Stochastic %K should be low in downtrend, got {result.K}");
    }

    [Fact]
    public void Stochastic_KBetween0And100()
    {
        var bars = GenerateOhlcvBars(20, 100m, 0.02m);
        var result = ComputeStochastic(
            bars.Select(b => b.High).ToList(),
            bars.Select(b => b.Low).ToList(),
            bars.Select(b => b.Close).ToList(),
            14, 3);

        Assert.InRange(result.K, 0m, 100m);
        Assert.NotNull(result.D);
        Assert.InRange(result.D!.Value, 0m, 100m);
    }

    // ================================================================
    // ADX
    // ================================================================

    [Fact]
    public void Adx_Between0And100()
    {
        var bars = GenerateOhlcvBars(40, 100m, 0.03m);
        var adx = ComputeAdx(
            bars.Select(b => b.High).ToList(),
            bars.Select(b => b.Low).ToList(),
            bars.Select(b => b.Close).ToList(),
            14);

        Assert.InRange(adx, 0m, 100m);
    }

    [Fact]
    public void Adx_StrongTrend_HighValue()
    {
        var bars = Enumerable.Range(0, 40).Select(i => new OhlcvBar
        {
            Open = 100m + i * 3m,
            High = 103m + i * 3m,
            Low = 99m + i * 3m,
            Close = 102m + i * 3m,
            Volume = 1000,
            Date = DateTime.Today.AddDays(-40 + i)
        }).ToList();

        var adx = ComputeAdx(
            bars.Select(b => b.High).ToList(),
            bars.Select(b => b.Low).ToList(),
            bars.Select(b => b.Close).ToList(),
            14);

        Assert.True(adx > 20m, $"ADX for strong trend should be > 20, got {adx}");
    }

    // ================================================================
    // OBV
    // ================================================================

    [Fact]
    public void Obv_UpDays_Positive()
    {
        var closes = Enumerable.Range(0, 10).Select(i => 100m + i).ToList();
        var volumes = Enumerable.Repeat(1000L, 10).ToList();

        var obv = ComputeObv(closes, volumes);
        Assert.True(obv > 0, $"OBV should be positive for uptrend, got {obv}");
    }

    [Fact]
    public void Obv_DownDays_Negative()
    {
        var closes = Enumerable.Range(0, 10).Select(i => 200m - i).ToList();
        var volumes = Enumerable.Repeat(1000L, 10).ToList();

        var obv = ComputeObv(closes, volumes);
        Assert.True(obv < 0, $"OBV should be negative for downtrend, got {obv}");
    }

    [Fact]
    public void Obv_FlatPrices_Zero()
    {
        var closes = Enumerable.Repeat(100m, 10).ToList();
        var volumes = Enumerable.Repeat(1000L, 10).ToList();

        var obv = ComputeObv(closes, volumes);
        Assert.Equal(0, obv);
    }

    // ================================================================
    // Fibonacci
    // ================================================================

    [Fact]
    public void Fibonacci_ContainsKeyLevels()
    {
        var bars = GenerateOhlcvBars(50, 100m, 0.05m);
        var json = ComputeFibonacciLevelsJson(bars);

        Assert.Contains("swing_high", json);
        Assert.Contains("swing_low", json);
        Assert.Contains("0.236", json);
        Assert.Contains("0.382", json);
        Assert.Contains("0.5", json);
        Assert.Contains("0.618", json);
        Assert.Contains("0.786", json);
        Assert.Contains("1.272", json);
        Assert.Contains("1.618", json);
    }

    // ================================================================
    // Pivot Points
    // ================================================================

    [Fact]
    public void PivotPoints_StandardFormula()
    {
        var prevBar = new OhlcvBar
        {
            Open = 100m, High = 110m, Low = 90m, Close = 105m,
            Volume = 1000, Date = DateTime.Today.AddDays(-1)
        };

        var json = ComputePivotLevelsJson(prevBar);
        Assert.Contains("pivot", json);
        Assert.Contains("s1", json);
        Assert.Contains("r1", json);
        Assert.Contains("s2", json);
        Assert.Contains("r2", json);
        Assert.Contains("s3", json);
        Assert.Contains("r3", json);

        var expectedPivot = Math.Round((110m + 90m + 105m) / 3m, 6);
        Assert.Contains(expectedPivot.ToString(), json);
    }

    // ================================================================
    // Ichimoku
    // ================================================================

    [Fact]
    public void Ichimoku_ReturnsAllComponents()
    {
        var bars = GenerateOhlcvBars(60, 100m, 0.02m);
        var result = ComputeIchimoku(
            bars.Select(b => b.High).ToList(),
            bars.Select(b => b.Low).ToList(),
            bars.Select(b => b.Close).ToList(),
            9, 26, 52);

        Assert.True(result.Tenkan > 0);
        Assert.True(result.Kijun > 0);
        Assert.True(result.SenkouA > 0);
        Assert.True(result.SenkouB > 0);
        Assert.True(result.Chikou > 0);
    }

    // ================================================================
    // Full Integration
    // ================================================================

    [Fact]
    public void ComputeAdvancedIndicators_EmptyList_ReturnsAllNull()
    {
        var result = AdvancedIndicatorCalculatorService.ComputeAdvancedIndicators(new List<OhlcvBar>());

        Assert.Null(result.BollingerUpper);
        Assert.Null(result.Atr);
        Assert.Null(result.StochK);
        Assert.Null(result.Adx);
        Assert.Null(result.Obv);
        Assert.Null(result.FibonacciLevels);
        Assert.Null(result.PivotLevels);
        Assert.Null(result.IchimokuTenkan);
    }

    [Fact]
    public void ComputeAdvancedIndicators_60Points_ReturnsAllIndicators()
    {
        var bars = GenerateOhlcvBars(60, 150m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeAdvancedIndicators(bars);

        Assert.NotNull(result.BollingerUpper);
        Assert.NotNull(result.BollingerLower);
        Assert.NotNull(result.BollingerMiddle);
        Assert.NotNull(result.BollingerBandwidth);
        Assert.NotNull(result.Atr);
        Assert.NotNull(result.StochK);
        Assert.NotNull(result.StochD);
        Assert.NotNull(result.Adx);
        Assert.NotNull(result.Obv);
        Assert.NotNull(result.FibonacciLevels);
        Assert.NotNull(result.PivotLevels);
        Assert.NotNull(result.IchimokuTenkan);
        Assert.NotNull(result.IchimokuKijun);
        Assert.NotNull(result.IchimokuSenkouA);
        Assert.NotNull(result.IchimokuSenkouB);
        Assert.NotNull(result.IchimokuChikou);
    }

    [Fact]
    public void ComputeAdvancedIndicators_InsufficientData_PartialResults()
    {
        var bars = GenerateOhlcvBars(15, 100m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeAdvancedIndicators(bars);

        Assert.NotNull(result.Atr);
        Assert.NotNull(result.FibonacciLevels);
        Assert.NotNull(result.PivotLevels);
        Assert.Null(result.BollingerUpper);
        Assert.Null(result.Adx);
        Assert.Null(result.IchimokuTenkan);
    }

    // ================================================================
    // Backfill (Sliding Window) Tests
    // ================================================================

    [Fact]
    public void ComputeBackfillIndicators_EmptyList_ReturnsEmpty()
    {
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(new List<OhlcvBar>());
        Assert.Empty(result);
    }

    [Fact]
    public void ComputeBackfillIndicators_InsufficientData_ReturnsEmpty()
    {
        var bars = GenerateOhlcvBars(13, 100m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(bars);
        Assert.Empty(result);
    }

    [Fact]
    public void ComputeBackfillIndicators_60Bars_ReturnsOnePerDay()
    {
        var bars = GenerateOhlcvBars(60, 150m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(bars);

        // Should produce one result per day from index 13 (MinDataPoints-1) to 59
        Assert.Equal(60 - 14 + 1, result.Count);

        // Each result should have a date
        foreach (var (date, set) in result)
        {
            Assert.NotEqual(default, date);
        }
    }

    [Fact]
    public void ComputeBackfillIndicators_EarlyDays_HavePartialIndicators()
    {
        var bars = GenerateOhlcvBars(60, 150m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(bars);

        // First result (day 14, only 14 data points) should NOT have Bollinger (needs 20)
        var firstDay = result[0];
        Assert.Null(firstDay.Set.BollingerUpper);
        // ATR needs 15 bars; first day has exactly 14, so ATR may also be null.
        // But OBV only needs 2 bars, so it should be present.
        Assert.NotNull(firstDay.Set.Obv);
    }

    [Fact]
    public void ComputeBackfillIndicators_LaterDays_HaveAllIndicators()
    {
        var bars = GenerateOhlcvBars(60, 150m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(bars);

        // Last day should have all indicators (60 data points)
        var lastDay = result[^1];
        Assert.NotNull(lastDay.Set.BollingerUpper);
        Assert.NotNull(lastDay.Set.Atr);
        Assert.NotNull(lastDay.Set.StochK);
        Assert.NotNull(lastDay.Set.Adx);
        Assert.NotNull(lastDay.Set.Obv);
        Assert.NotNull(lastDay.Set.FibonacciLevels);
        Assert.NotNull(lastDay.Set.PivotLevels);
        Assert.NotNull(lastDay.Set.IchimokuTenkan);
    }

    [Fact]
    public void ComputeBackfillIndicators_DatesAreChronological()
    {
        var bars = GenerateOhlcvBars(30, 100m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(bars);

        for (int i = 1; i < result.Count; i++)
        {
            Assert.True(result[i].Date > result[i - 1].Date,
                $"Date at index {i} ({result[i].Date}) should be after index {i - 1} ({result[i - 1].Date})");
        }
    }

    [Fact]
    public void ComputeBackfillIndicators_DatesMatchBarDates()
    {
        var bars = GenerateOhlcvBars(30, 100m, 0.02m);
        var result = AdvancedIndicatorCalculatorService.ComputeBackfillIndicators(bars);

        // Each result date should correspond to a bar's date
        foreach (var (date, _) in result)
        {
            Assert.Contains(bars, b => b.Date == date);
        }
    }

    // ================================================================
    // Helpers
    // ================================================================

    private static List<OhlcvBar> GenerateOhlcvBars(int count, decimal startPrice, decimal volatility)
    {
        var bars = new List<OhlcvBar>(count);
        var price = startPrice;
        var rng = new Random(42);

        for (int i = 0; i < count; i++)
        {
            var change = price * volatility * (decimal)(rng.NextDouble() * 2 - 1);
            var close = Math.Max(price + change, 0.01m);
            var high = Math.Max(close, price) + Math.Abs(change) * 0.5m;
            var low = Math.Min(close, price) - Math.Abs(change) * 0.5m;
            if (low <= 0) low = 0.01m;

            bars.Add(new OhlcvBar
            {
                Open = Math.Round(price, 4),
                High = Math.Round(high, 4),
                Low = Math.Round(low, 4),
                Close = Math.Round(close, 4),
                Volume = 1000 + rng.Next(0, 5000),
                Date = DateTime.Today.AddDays(-count + i)
            });

            price = close;
        }

        return bars;
    }
}
