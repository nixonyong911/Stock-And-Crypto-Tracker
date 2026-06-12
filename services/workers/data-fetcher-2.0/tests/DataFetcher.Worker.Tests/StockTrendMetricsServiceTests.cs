using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using Xunit;

namespace DataFetcher.Worker.Tests;

/// <summary>
/// Tests for the pure metric extraction in
/// <see cref="StockTrendMetricsService.ComputeMetrics"/>, the shared
/// <see cref="TrendMath"/> helpers, and the long-horizon regime signal in
/// <see cref="PriceTargetCalculatorService"/>.
/// </summary>
public class StockTrendMetricsServiceTests
{
    private static readonly DateTime Now = new(2026, 6, 12, 12, 0, 0, DateTimeKind.Utc);

    private static EtoroCandle Candle(DateTime date, double close, double? high = null, double? low = null) => new()
    {
        FromDate = date,
        Open = close,
        High = high ?? close,
        Low = low ?? close,
        Close = close,
        Volume = 1
    };

    /// <summary>Daily candles ending yesterday, oldest-first, constant price.</summary>
    private static List<EtoroCandle> FlatSeries(int count, double close)
    {
        var list = new List<EtoroCandle>();
        for (var i = count; i >= 1; i--)
            list.Add(Candle(Now.AddDays(-i), close));
        return list;
    }

    // ── TrendMath ─────────────────────────────────────────────────────

    [Fact]
    public void Sma_ExactValueOnKnownSeries()
    {
        // last 3 of [1..5] = (3+4+5)/3
        var closes = new List<decimal> { 1, 2, 3, 4, 5 };
        Assert.Equal(4m, TrendMath.Sma(closes, 3));
    }

    [Fact]
    public void Sma_NullWhenSeriesTooShort()
    {
        Assert.Null(TrendMath.Sma(new List<decimal> { 1, 2 }, 3));
    }

    [Fact]
    public void Ema_EqualsPriceOnConstantSeries()
    {
        var closes = Enumerable.Repeat(42m, 250).ToList();
        Assert.Equal(42m, TrendMath.Ema(closes, 50, TrendMath.Ema50MinBars));
    }

    [Fact]
    public void Ema_NullBelowMinBars()
    {
        var closes = Enumerable.Repeat(42m, 199).ToList();
        Assert.Null(TrendMath.Ema(closes, 50, TrendMath.Ema50MinBars));
    }

    [Fact]
    public void Ema_ReactsFasterThanSmaToStepChange()
    {
        // Flat at 100, then a step to 200 for the last 10 bars: the EMA's
        // exponential weighting pulls toward the new level faster than the
        // equal-weighted SMA-50.
        var closes = Enumerable.Repeat(100m, 240).Concat(Enumerable.Repeat(200m, 10)).ToList();
        var ema = TrendMath.Ema(closes, 50, TrendMath.Ema50MinBars);
        var sma = TrendMath.Sma(closes, 50);
        Assert.NotNull(ema);
        Assert.NotNull(sma);
        Assert.True(ema > sma);
        Assert.InRange(ema!.Value, 100m, 200m);
    }

    // ── ComputeMetrics ────────────────────────────────────────────────

    [Fact]
    public void ComputeMetrics_RangeRestrictedToTrailing365Days_MasUseFullSeries()
    {
        // 420 bars at 100, except: a 500-high spike 400 days ago (outside the
        // range window, still part of the MA series) and a 130-high bar inside.
        var candles = new List<EtoroCandle>();
        for (var i = 420; i >= 1; i--)
        {
            var date = Now.AddDays(-i);
            if (i == 400) candles.Add(Candle(date, 100, high: 500));
            else if (i == 100) candles.Add(Candle(date, 100, high: 130, low: 90));
            else candles.Add(Candle(date, 100, high: 110, low: 95));
        }

        var metrics = StockTrendMetricsService.ComputeMetrics(28, candles, Now);

        Assert.NotNull(metrics);
        Assert.Equal(28, metrics!.StockTickerId);
        Assert.Equal(130m, metrics.Week52High); // 500-spike excluded: older than 365d
        Assert.Equal(90m, metrics.Week52Low);
        Assert.Equal(DateOnly.FromDateTime(Now.AddDays(-100)), metrics.Week52HighDate);
        Assert.Equal(365, metrics.CoverageDays);
        Assert.Equal(100m, metrics.Sma50);
        Assert.Equal(100m, metrics.Sma200);
        Assert.Equal(100m, metrics.Ema50);
    }

    [Fact]
    public void ComputeMetrics_NullLongMasUnder200Bars_RangeStillValid()
    {
        var metrics = StockTrendMetricsService.ComputeMetrics(1, FlatSeries(120, 50), Now);

        Assert.NotNull(metrics);
        Assert.Equal(50m, metrics!.Week52High);
        Assert.Equal(50m, metrics.Week52Low);
        Assert.Equal(50m, metrics.Sma50);   // 120 ≥ 50 bars
        Assert.Null(metrics.Sma200);        // < 200 bars
        Assert.Null(metrics.Ema50);         // < 200 bars (seed not converged)
        Assert.Equal(120, metrics.CoverageDays);
    }

    [Fact]
    public void ComputeMetrics_ReturnsNullWithoutUsableBars()
    {
        Assert.Null(StockTrendMetricsService.ComputeMetrics(1, new List<EtoroCandle>(), Now));
        Assert.Null(StockTrendMetricsService.ComputeMetrics(
            1, new List<EtoroCandle> { Candle(Now.AddDays(-1), 0) }, Now));
    }

    [Fact]
    public void ComputeMetrics_UnsortedInputIsSortedBeforeMas()
    {
        // Same flat series shuffled: MAs must not depend on input order.
        var candles = FlatSeries(250, 75);
        var shuffled = candles.OrderBy(c => c.Close).ThenByDescending(c => c.FromDate).ToList();

        var metrics = StockTrendMetricsService.ComputeMetrics(2, shuffled, Now);

        Assert.NotNull(metrics);
        Assert.Equal(75m, metrics!.Sma200);
        Assert.Equal(75m, metrics.Ema50);
    }

    // ── Long-horizon regime signal in the price-target calculator ─────

    private static PriceTargetParameters Params(string traderType) => new()
    {
        AssetType = "stock",
        TraderType = traderType,
        LookbackDays = traderType == "day" ? 5 : traderType == "swing" ? 20 : 60,
    };

    private static List<PriceTargetCalculatorService.DailyClose> Closes(decimal price, int days = 60)
    {
        var list = new List<PriceTargetCalculatorService.DailyClose>();
        for (var i = days; i >= 1; i--)
            list.Add(new PriceTargetCalculatorService.DailyClose(
                DateOnly.FromDateTime(Now.AddDays(-i)), price));
        return list;
    }

    [Fact]
    public void LongTerm_BullishAboveSma200_DespiteBearishShortTermCrossover()
    {
        var calc = new PriceTargetCalculatorService();
        // Short-term bearish: ema20 < sma20, close below both.
        var indicators = new PriceTargetCalculatorService.IndicatorSnapshot(7330m, 7480m, 50m);
        // Long-term bullish: close 7415 > sma200 7000, sma50 7300 > sma200.
        var longTrend = new PriceTargetCalculatorService.LongTrendSnapshot(7300m, 7000m, 7350m);

        var longTerm = calc.Calculate(7415m, Closes(7415m), indicators, [], Params("long_term"), longTrend);
        var swing = calc.Calculate(7415m, Closes(7415m), indicators, [], Params("swing"), longTrend);

        Assert.Equal("bullish", longTerm.SignalSummary); // regime: +1.5 * 0.4 = 0.6 > 0.2
        Assert.Equal("bearish", swing.SignalSummary);    // crossover: -1.5 * 0.4 = -0.6 < -0.2
    }

    [Fact]
    public void LongTerm_FallsBackToShortHorizonScoreWithoutSma200()
    {
        var calc = new PriceTargetCalculatorService();
        var indicators = new PriceTargetCalculatorService.IndicatorSnapshot(7330m, 7480m, 50m);

        var withoutTrend = calc.Calculate(7415m, Closes(7415m), indicators, [], Params("long_term"));
        var swing = calc.Calculate(7415m, Closes(7415m), indicators, [], Params("swing"));

        Assert.Equal(swing.SignalSummary, withoutTrend.SignalSummary);
    }

    [Fact]
    public void DaySwing_OutputsUnchangedByRename_AndIgnoreLongTrendScore()
    {
        var calc = new PriceTargetCalculatorService();
        // Bullish short-term setup; bearish long-term regime must NOT leak in.
        var indicators = new PriceTargetCalculatorService.IndicatorSnapshot(105m, 100m, 50m);
        var bearishLongTrend = new PriceTargetCalculatorService.LongTrendSnapshot(90m, 120m, 95m);

        var withTrend = calc.Calculate(110m, Closes(110m), indicators, [], Params("day"), bearishLongTrend);
        var withoutTrend = calc.Calculate(110m, Closes(110m), indicators, [], Params("day"));

        Assert.Equal("bullish", withTrend.SignalSummary);
        Assert.Equal(withoutTrend.SignalSummary, withTrend.SignalSummary);
        Assert.Equal(withoutTrend.TargetPrice, withTrend.TargetPrice);
        Assert.Equal(withoutTrend.EntryPrice, withTrend.EntryPrice);
    }

    [Fact]
    public void Metadata_CarriesRenamedAndLongTrendKeys()
    {
        var calc = new PriceTargetCalculatorService();
        var indicators = new PriceTargetCalculatorService.IndicatorSnapshot(105m, 100m, 50m);
        var longTrend = new PriceTargetCalculatorService.LongTrendSnapshot(98m, 95m, 97m);

        var result = calc.Calculate(110m, Closes(110m), indicators, [], Params("swing"), longTrend);

        Assert.Contains("\"sma_20\":100", result.MetadataJson);
        Assert.Contains("\"ema_50\":97", result.MetadataJson);
        Assert.Contains("\"sma_50\":98", result.MetadataJson);
        Assert.Contains("\"sma_200\":95", result.MetadataJson);
    }
}
