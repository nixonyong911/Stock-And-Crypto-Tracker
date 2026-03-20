using System.Diagnostics;
using System.Text.Json;
using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.LocalIndicators;

public class AdvancedIndicatorCalculatorService : IAdvancedIndicatorCalculatorService
{
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly IStockTickerRepository _stockTickerRepo;
    private readonly ICryptoTickerRepository _cryptoTickerRepo;
    private readonly IStockIndicatorAdvancedRepository _stockAdvancedRepo;
    private readonly ICryptoIndicatorAdvancedRepository _cryptoAdvancedRepo;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<AdvancedIndicatorCalculatorService> _logger;

    private int? _dataSourceId;
    private const int MinDataPoints = 14;
    private const int LookbackDays = 60;
    private const string MetricsPrefix = "advanced_indicator";

    public AdvancedIndicatorCalculatorService(
        IDbConnectionFactory dbConnectionFactory,
        IStockTickerRepository stockTickerRepo,
        ICryptoTickerRepository cryptoTickerRepo,
        IStockIndicatorAdvancedRepository stockAdvancedRepo,
        ICryptoIndicatorAdvancedRepository cryptoAdvancedRepo,
        IMetricsClient metrics,
        ILogger<AdvancedIndicatorCalculatorService> logger)
    {
        _dbConnectionFactory = dbConnectionFactory;
        _stockTickerRepo = stockTickerRepo;
        _cryptoTickerRepo = cryptoTickerRepo;
        _stockAdvancedRepo = stockAdvancedRepo;
        _cryptoAdvancedRepo = cryptoAdvancedRepo;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<BatchIndicatorResult> ComputeAllStockAdvancedIndicatorsAsync(CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        var result = new BatchIndicatorResult();

        try
        {
            var tickers = (await _stockTickerRepo.GetActiveTickersAsync()).ToList();
            result.TotalTickers = tickers.Count;
            var dataSourceId = await GetDataSourceIdAsync();

            foreach (var ticker in tickers)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var bars = await GetStockDailyOhlcvAsync(ticker.Id, LookbackDays);
                    if (bars.Count < MinDataPoints)
                    {
                        result.SkippedCount++;
                        continue;
                    }

                    var computed = ComputeAdvancedIndicators(bars);

                    var indicator = new StockIndicatorAdvanced
                    {
                        StockTickerId = ticker.Id,
                        DataSourceId = dataSourceId,
                        IndicatorTime = DateTime.UtcNow,
                        BollingerUpper = computed.BollingerUpper,
                        BollingerLower = computed.BollingerLower,
                        BollingerMiddle = computed.BollingerMiddle,
                        BollingerBandwidth = computed.BollingerBandwidth,
                        Atr = computed.Atr,
                        StochK = computed.StochK,
                        StochD = computed.StochD,
                        Adx = computed.Adx,
                        Obv = computed.Obv,
                        FibonacciLevels = computed.FibonacciLevels,
                        PivotLevels = computed.PivotLevels,
                        IchimokuTenkan = computed.IchimokuTenkan,
                        IchimokuKijun = computed.IchimokuKijun,
                        IchimokuSenkouA = computed.IchimokuSenkouA,
                        IchimokuSenkouB = computed.IchimokuSenkouB,
                        IchimokuChikou = computed.IchimokuChikou
                    };

                    await _stockAdvancedRepo.BulkUpsertAsync(new[] { indicator });
                    result.SuccessCount++;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed computing advanced indicators for {Symbol}", ticker.Symbol);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed batch stock advanced indicator computation");
            result.Errors.Add($"Batch error: {ex.Message}");
        }

        sw.Stop();
        result.DurationSeconds = sw.Elapsed.TotalSeconds;
        return result;
    }

    public async Task<BatchIndicatorResult> ComputeAllCryptoAdvancedIndicatorsAsync(CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        var result = new BatchIndicatorResult();

        try
        {
            var tickers = (await _cryptoTickerRepo.GetActiveTickersAsync()).ToList();
            result.TotalTickers = tickers.Count;
            var dataSourceId = await GetDataSourceIdAsync();

            foreach (var ticker in tickers)
            {
                if (cancellationToken.IsCancellationRequested) break;

                try
                {
                    var bars = await GetCryptoDailyOhlcvAsync(ticker.Id, LookbackDays);
                    if (bars.Count < MinDataPoints)
                    {
                        result.SkippedCount++;
                        continue;
                    }

                    var computed = ComputeAdvancedIndicators(bars);

                    var indicator = new CryptoIndicatorAdvanced
                    {
                        CryptoTickerId = ticker.Id,
                        DataSourceId = dataSourceId,
                        IndicatorTime = DateTime.UtcNow,
                        BollingerUpper = computed.BollingerUpper,
                        BollingerLower = computed.BollingerLower,
                        BollingerMiddle = computed.BollingerMiddle,
                        BollingerBandwidth = computed.BollingerBandwidth,
                        Atr = computed.Atr,
                        StochK = computed.StochK,
                        StochD = computed.StochD,
                        Adx = computed.Adx,
                        Obv = computed.Obv,
                        FibonacciLevels = computed.FibonacciLevels,
                        PivotLevels = computed.PivotLevels,
                        IchimokuTenkan = computed.IchimokuTenkan,
                        IchimokuKijun = computed.IchimokuKijun,
                        IchimokuSenkouA = computed.IchimokuSenkouA,
                        IchimokuSenkouB = computed.IchimokuSenkouB,
                        IchimokuChikou = computed.IchimokuChikou
                    };

                    await _cryptoAdvancedRepo.BulkUpsertAsync(new[] { indicator });
                    result.SuccessCount++;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed computing advanced crypto indicators for {Symbol}", ticker.Symbol);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed batch crypto advanced indicator computation");
            result.Errors.Add($"Batch error: {ex.Message}");
        }

        sw.Stop();
        result.DurationSeconds = sw.Elapsed.TotalSeconds;
        return result;
    }

    // ================================================================
    // Single-Ticker Backfill (called by AnalysisBackfillService)
    // ================================================================

    public async Task<BackfillAdvancedResult> BackfillStockAdvancedIndicatorsAsync(
        int stockTickerId, string symbol, CancellationToken cancellationToken = default)
    {
        var result = new BackfillAdvancedResult();

        try
        {
            var allBars = await GetStockDailyOhlcvAsync(stockTickerId, 365);
            if (allBars.Count < MinDataPoints)
            {
                result.Success = true;
                result.DaysSkipped = allBars.Count;
                _logger.LogInformation("Skipping advanced backfill for {Symbol}: only {Count} data points", symbol, allBars.Count);
                return result;
            }

            var dataSourceId = await GetDataSourceIdAsync();
            var indicators = ComputeBackfillIndicators(allBars);

            var entities = indicators.Select((pair, idx) => new StockIndicatorAdvanced
            {
                StockTickerId = stockTickerId,
                DataSourceId = dataSourceId,
                IndicatorTime = idx == indicators.Count - 1 ? DateTime.UtcNow : pair.Date,
                BollingerUpper = pair.Set.BollingerUpper,
                BollingerLower = pair.Set.BollingerLower,
                BollingerMiddle = pair.Set.BollingerMiddle,
                BollingerBandwidth = pair.Set.BollingerBandwidth,
                Atr = pair.Set.Atr,
                StochK = pair.Set.StochK,
                StochD = pair.Set.StochD,
                Adx = pair.Set.Adx,
                Obv = pair.Set.Obv,
                FibonacciLevels = pair.Set.FibonacciLevels,
                PivotLevels = pair.Set.PivotLevels,
                IchimokuTenkan = pair.Set.IchimokuTenkan,
                IchimokuKijun = pair.Set.IchimokuKijun,
                IchimokuSenkouA = pair.Set.IchimokuSenkouA,
                IchimokuSenkouB = pair.Set.IchimokuSenkouB,
                IchimokuChikou = pair.Set.IchimokuChikou
            }).ToList();

            if (entities.Count > 0)
                await _stockAdvancedRepo.BulkUpsertAsync(entities);

            result.Success = true;
            result.DaysComputed = entities.Count;
            _logger.LogInformation("Advanced backfill for stock {Symbol}: {Count} days computed from {Total} bars",
                symbol, entities.Count, allBars.Count);
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
            _logger.LogError(ex, "Advanced indicator backfill failed for stock {Symbol}", symbol);
        }

        return result;
    }

    public async Task<BackfillAdvancedResult> BackfillCryptoAdvancedIndicatorsAsync(
        int cryptoTickerId, string symbol, CancellationToken cancellationToken = default)
    {
        var result = new BackfillAdvancedResult();

        try
        {
            var allBars = await GetCryptoDailyOhlcvAsync(cryptoTickerId, 365);
            if (allBars.Count < MinDataPoints)
            {
                result.Success = true;
                result.DaysSkipped = allBars.Count;
                _logger.LogInformation("Skipping advanced backfill for crypto {Symbol}: only {Count} data points", symbol, allBars.Count);
                return result;
            }

            var dataSourceId = await GetDataSourceIdAsync();
            var indicators = ComputeBackfillIndicators(allBars);

            var entities = indicators.Select((pair, idx) => new CryptoIndicatorAdvanced
            {
                CryptoTickerId = cryptoTickerId,
                DataSourceId = dataSourceId,
                IndicatorTime = idx == indicators.Count - 1 ? DateTime.UtcNow : pair.Date,
                BollingerUpper = pair.Set.BollingerUpper,
                BollingerLower = pair.Set.BollingerLower,
                BollingerMiddle = pair.Set.BollingerMiddle,
                BollingerBandwidth = pair.Set.BollingerBandwidth,
                Atr = pair.Set.Atr,
                StochK = pair.Set.StochK,
                StochD = pair.Set.StochD,
                Adx = pair.Set.Adx,
                Obv = pair.Set.Obv,
                FibonacciLevels = pair.Set.FibonacciLevels,
                PivotLevels = pair.Set.PivotLevels,
                IchimokuTenkan = pair.Set.IchimokuTenkan,
                IchimokuKijun = pair.Set.IchimokuKijun,
                IchimokuSenkouA = pair.Set.IchimokuSenkouA,
                IchimokuSenkouB = pair.Set.IchimokuSenkouB,
                IchimokuChikou = pair.Set.IchimokuChikou
            }).ToList();

            if (entities.Count > 0)
                await _cryptoAdvancedRepo.BulkUpsertAsync(entities);

            result.Success = true;
            result.DaysComputed = entities.Count;
            _logger.LogInformation("Advanced backfill for crypto {Symbol}: {Count} days computed from {Total} bars",
                symbol, entities.Count, allBars.Count);
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
            _logger.LogError(ex, "Advanced indicator backfill failed for crypto {Symbol}", symbol);
        }

        return result;
    }

    /// <summary>
    /// Sliding-window computation over historical bars.
    /// For each day from MinDataPoints onward, computes advanced indicators
    /// using all bars up to that day (rolling window).
    /// </summary>
    internal static List<(DateTime Date, AdvancedIndicatorSet Set)> ComputeBackfillIndicators(List<OhlcvBar> allBars)
    {
        var results = new List<(DateTime Date, AdvancedIndicatorSet Set)>();
        var windowSize = 60;

        for (int i = MinDataPoints - 1; i < allBars.Count; i++)
        {
            var startIdx = Math.Max(0, i - windowSize + 1);
            var window = allBars.GetRange(startIdx, i - startIdx + 1);
            var computed = ComputeAdvancedIndicators(window);
            results.Add((allBars[i].Date, computed));
        }

        return results;
    }

    // ================================================================
    // Computation
    // ================================================================

    internal static AdvancedIndicatorSet ComputeAdvancedIndicators(List<OhlcvBar> bars)
    {
        var set = new AdvancedIndicatorSet();
        var n = bars.Count;
        if (n == 0) return set;

        var closes = bars.Select(b => b.Close).ToList();
        var highs = bars.Select(b => b.High).ToList();
        var lows = bars.Select(b => b.Low).ToList();
        var volumes = bars.Select(b => b.Volume).ToList();

        // Bollinger Bands (20, 2σ)
        if (n >= 20)
        {
            var bb = ComputeBollingerBands(closes, 20, 2.0m);
            set.BollingerUpper = bb.Upper;
            set.BollingerLower = bb.Lower;
            set.BollingerMiddle = bb.Middle;
            set.BollingerBandwidth = bb.Bandwidth;
        }

        // ATR (14-period)
        if (n >= 15)
            set.Atr = ComputeAtr(highs, lows, closes, 14);

        // Stochastic (14, 3)
        if (n >= 17)
        {
            var stoch = ComputeStochastic(highs, lows, closes, 14, 3);
            set.StochK = stoch.K;
            set.StochD = stoch.D;
        }

        // ADX (14-period)
        if (n >= 28)
            set.Adx = ComputeAdx(highs, lows, closes, 14);

        // OBV
        if (n >= 2)
            set.Obv = ComputeObv(closes, volumes);

        // Fibonacci Retracement (50-day lookback or available data)
        if (n >= 14)
        {
            var fibBars = n >= 50 ? bars.Skip(n - 50).ToList() : bars;
            set.FibonacciLevels = ComputeFibonacciLevelsJson(fibBars);
        }

        // Pivot Points (Standard, from most recent completed bar)
        if (n >= 2)
        {
            var prevBar = bars[^2];
            set.PivotLevels = ComputePivotLevelsJson(prevBar);
        }

        // Ichimoku Cloud (9, 26, 52)
        if (n >= 52)
        {
            var ich = ComputeIchimoku(highs, lows, closes, 9, 26, 52);
            set.IchimokuTenkan = ich.Tenkan;
            set.IchimokuKijun = ich.Kijun;
            set.IchimokuSenkouA = ich.SenkouA;
            set.IchimokuSenkouB = ich.SenkouB;
            set.IchimokuChikou = ich.Chikou;
        }

        return set;
    }

    // ----------------------------------------------------------------
    // Bollinger Bands
    // ----------------------------------------------------------------
    internal static BollingerResult ComputeBollingerBands(List<decimal> closes, int period, decimal numStdDev)
    {
        var n = closes.Count;
        var window = closes.Skip(n - period).ToList();
        var middle = Math.Round(window.Average(), 6);

        var variance = window.Sum(c => (c - middle) * (c - middle)) / period;
        var stdDev = (decimal)Math.Sqrt((double)variance);

        var upper = Math.Round(middle + numStdDev * stdDev, 6);
        var lower = Math.Round(middle - numStdDev * stdDev, 6);
        var bandwidth = middle != 0 ? Math.Round((upper - lower) / middle * 100m, 4) : 0;

        return new BollingerResult { Upper = upper, Lower = lower, Middle = middle, Bandwidth = bandwidth };
    }

    // ----------------------------------------------------------------
    // ATR (Average True Range) — Wilder's smoothing
    // ----------------------------------------------------------------
    internal static decimal ComputeAtr(List<decimal> highs, List<decimal> lows, List<decimal> closes, int period)
    {
        var trueRanges = new List<decimal>();
        for (int i = 1; i < closes.Count; i++)
        {
            var tr = Math.Max(
                highs[i] - lows[i],
                Math.Max(
                    Math.Abs(highs[i] - closes[i - 1]),
                    Math.Abs(lows[i] - closes[i - 1])
                ));
            trueRanges.Add(tr);
        }

        if (trueRanges.Count < period) return 0;

        var atr = trueRanges.Take(period).Average();
        for (int i = period; i < trueRanges.Count; i++)
            atr = (atr * (period - 1) + trueRanges[i]) / period;

        return Math.Round(atr, 6);
    }

    // ----------------------------------------------------------------
    // Stochastic Oscillator
    // ----------------------------------------------------------------
    internal static StochasticResult ComputeStochastic(List<decimal> highs, List<decimal> lows, List<decimal> closes, int kPeriod, int dPeriod)
    {
        var kValues = new List<decimal>();
        for (int i = kPeriod - 1; i < closes.Count; i++)
        {
            var highestHigh = decimal.MinValue;
            var lowestLow = decimal.MaxValue;
            for (int j = i - kPeriod + 1; j <= i; j++)
            {
                if (highs[j] > highestHigh) highestHigh = highs[j];
                if (lows[j] < lowestLow) lowestLow = lows[j];
            }

            var range = highestHigh - lowestLow;
            var k = range != 0 ? (closes[i] - lowestLow) / range * 100m : 50m;
            kValues.Add(Math.Round(k, 4));
        }

        if (kValues.Count < dPeriod)
            return new StochasticResult { K = kValues.LastOrDefault(), D = null };

        var dValues = new List<decimal>();
        for (int i = dPeriod - 1; i < kValues.Count; i++)
            dValues.Add(kValues.Skip(i - dPeriod + 1).Take(dPeriod).Average());

        return new StochasticResult
        {
            K = Math.Round(kValues[^1], 4),
            D = Math.Round(dValues[^1], 4)
        };
    }

    // ----------------------------------------------------------------
    // ADX (Average Directional Index)
    // ----------------------------------------------------------------
    internal static decimal ComputeAdx(List<decimal> highs, List<decimal> lows, List<decimal> closes, int period)
    {
        var plusDm = new List<decimal>();
        var minusDm = new List<decimal>();
        var trueRanges = new List<decimal>();

        for (int i = 1; i < closes.Count; i++)
        {
            var upMove = highs[i] - highs[i - 1];
            var downMove = lows[i - 1] - lows[i];

            plusDm.Add(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDm.Add(downMove > upMove && downMove > 0 ? downMove : 0);

            var tr = Math.Max(
                highs[i] - lows[i],
                Math.Max(
                    Math.Abs(highs[i] - closes[i - 1]),
                    Math.Abs(lows[i] - closes[i - 1])
                ));
            trueRanges.Add(tr);
        }

        if (trueRanges.Count < period) return 0;

        // Wilder's smoothing for +DM, -DM, and TR
        var smoothPlusDm = plusDm.Take(period).Sum();
        var smoothMinusDm = minusDm.Take(period).Sum();
        var smoothTr = trueRanges.Take(period).Sum();

        var dxValues = new List<decimal>();

        for (int i = period; i <= trueRanges.Count; i++)
        {
            if (i > period)
            {
                smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDm[i - 1];
                smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDm[i - 1];
                smoothTr = smoothTr - smoothTr / period + trueRanges[i - 1];
            }

            var plusDi = smoothTr != 0 ? smoothPlusDm / smoothTr * 100m : 0;
            var minusDi = smoothTr != 0 ? smoothMinusDm / smoothTr * 100m : 0;
            var diSum = plusDi + minusDi;
            var dx = diSum != 0 ? Math.Abs(plusDi - minusDi) / diSum * 100m : 0;
            dxValues.Add(dx);
        }

        if (dxValues.Count < period) return dxValues.Count > 0 ? Math.Round(dxValues.Last(), 4) : 0;

        var adx = dxValues.Take(period).Average();
        for (int i = period; i < dxValues.Count; i++)
            adx = (adx * (period - 1) + dxValues[i]) / period;

        return Math.Round(adx, 4);
    }

    // ----------------------------------------------------------------
    // OBV (On-Balance Volume)
    // ----------------------------------------------------------------
    internal static long ComputeObv(List<decimal> closes, List<long> volumes)
    {
        long obv = 0;
        for (int i = 1; i < closes.Count; i++)
        {
            if (closes[i] > closes[i - 1])
                obv += volumes[i];
            else if (closes[i] < closes[i - 1])
                obv -= volumes[i];
        }
        return obv;
    }

    // ----------------------------------------------------------------
    // Fibonacci Retracement
    // ----------------------------------------------------------------
    internal static string ComputeFibonacciLevelsJson(List<OhlcvBar> bars)
    {
        var swingHigh = bars.Max(b => b.High);
        var swingLow = bars.Min(b => b.Low);
        var range = swingHigh - swingLow;

        var levels = new Dictionary<string, object>
        {
            ["swing_high"] = Math.Round(swingHigh, 6),
            ["swing_low"] = Math.Round(swingLow, 6),
            ["levels"] = new Dictionary<string, decimal>
            {
                ["0.0"] = Math.Round(swingHigh, 6),
                ["0.236"] = Math.Round(swingHigh - range * 0.236m, 6),
                ["0.382"] = Math.Round(swingHigh - range * 0.382m, 6),
                ["0.5"] = Math.Round(swingHigh - range * 0.5m, 6),
                ["0.618"] = Math.Round(swingHigh - range * 0.618m, 6),
                ["0.786"] = Math.Round(swingHigh - range * 0.786m, 6),
                ["1.0"] = Math.Round(swingLow, 6)
            },
            ["extensions"] = new Dictionary<string, decimal>
            {
                ["1.272"] = Math.Round(swingHigh + range * 0.272m, 6),
                ["1.618"] = Math.Round(swingHigh + range * 0.618m, 6),
                ["2.618"] = Math.Round(swingHigh + range * 1.618m, 6)
            }
        };

        return JsonSerializer.Serialize(levels);
    }

    // ----------------------------------------------------------------
    // Pivot Points (Standard)
    // ----------------------------------------------------------------
    internal static string ComputePivotLevelsJson(OhlcvBar prevBar)
    {
        var pivot = Math.Round((prevBar.High + prevBar.Low + prevBar.Close) / 3m, 6);
        var s1 = Math.Round(2m * pivot - prevBar.High, 6);
        var r1 = Math.Round(2m * pivot - prevBar.Low, 6);
        var s2 = Math.Round(pivot - (prevBar.High - prevBar.Low), 6);
        var r2 = Math.Round(pivot + (prevBar.High - prevBar.Low), 6);
        var s3 = Math.Round(prevBar.Low - 2m * (prevBar.High - pivot), 6);
        var r3 = Math.Round(prevBar.High + 2m * (pivot - prevBar.Low), 6);

        var levels = new Dictionary<string, decimal>
        {
            ["pivot"] = pivot,
            ["s1"] = s1, ["s2"] = s2, ["s3"] = s3,
            ["r1"] = r1, ["r2"] = r2, ["r3"] = r3
        };

        return JsonSerializer.Serialize(levels);
    }

    // ----------------------------------------------------------------
    // Ichimoku Cloud
    // ----------------------------------------------------------------
    internal static IchimokuResult ComputeIchimoku(List<decimal> highs, List<decimal> lows, List<decimal> closes, int tenkanPeriod, int kijunPeriod, int senkouBPeriod)
    {
        var n = closes.Count;

        decimal PeriodMid(List<decimal> h, List<decimal> l, int from, int length)
        {
            var sliceH = h.Skip(from).Take(length);
            var sliceL = l.Skip(from).Take(length);
            return (sliceH.Max() + sliceL.Min()) / 2m;
        }

        var tenkan = Math.Round(PeriodMid(highs, lows, n - tenkanPeriod, tenkanPeriod), 6);
        var kijun = Math.Round(PeriodMid(highs, lows, n - kijunPeriod, kijunPeriod), 6);
        var senkouA = Math.Round((tenkan + kijun) / 2m, 6);
        var senkouB = Math.Round(PeriodMid(highs, lows, n - senkouBPeriod, senkouBPeriod), 6);
        var chikou = Math.Round(closes[^1], 6);

        return new IchimokuResult
        {
            Tenkan = tenkan,
            Kijun = kijun,
            SenkouA = senkouA,
            SenkouB = senkouB,
            Chikou = chikou
        };
    }

    // ================================================================
    // Data Fetching
    // ================================================================

    private async Task<List<OhlcvBar>> GetStockDailyOhlcvAsync(int stockTickerId, int days)
    {
        using var connection = _dbConnectionFactory.CreateConnection();

        const string sql = @"
            SELECT daily_open AS Open, daily_high AS High, daily_low AS Low,
                   daily_close AS Close, COALESCE(daily_volume, 0) AS Volume, analysis_date AS Date
            FROM analysis_stock_candlestick_pattern
            WHERE stock_ticker_id = @TickerId
              AND daily_close IS NOT NULL
            ORDER BY analysis_date ASC
            LIMIT @Days";

        var rows = await connection.QueryAsync<OhlcvBar>(sql, new { TickerId = stockTickerId, Days = days });
        return rows.ToList();
    }

    private async Task<List<OhlcvBar>> GetCryptoDailyOhlcvAsync(int cryptoTickerId, int days)
    {
        using var connection = _dbConnectionFactory.CreateConnection();

        const string sql = @"
            SELECT daily_open AS Open, daily_high AS High, daily_low AS Low,
                   daily_close AS Close, COALESCE(daily_volume, 0) AS Volume, analysis_date AS Date
            FROM analysis_crypto_candlestick_pattern
            WHERE crypto_ticker_id = @TickerId
              AND daily_close IS NOT NULL
            ORDER BY analysis_date ASC
            LIMIT @Days";

        var rows = await connection.QueryAsync<OhlcvBar>(sql, new { TickerId = cryptoTickerId, Days = days });
        return rows.ToList();
    }

    private async Task<int> GetDataSourceIdAsync()
    {
        if (_dataSourceId.HasValue) return _dataSourceId.Value;

        using var conn = _dbConnectionFactory.CreateConnection();
        _dataSourceId = await conn.QueryFirstOrDefaultAsync<int?>(
            "SELECT id FROM lookup_data_sources WHERE name = 'LocalCompute'");

        if (!_dataSourceId.HasValue)
        {
            _dataSourceId = await conn.QueryFirstOrDefaultAsync<int?>(
                "SELECT id FROM lookup_data_sources WHERE name = 'Massive'");
        }

        return _dataSourceId ?? throw new InvalidOperationException("No data source found for indicators");
    }

    // ================================================================
    // Internal Types
    // ================================================================

    public record OhlcvBar
    {
        public decimal Open { get; init; }
        public decimal High { get; init; }
        public decimal Low { get; init; }
        public decimal Close { get; init; }
        public long Volume { get; init; }
        public DateTime Date { get; init; }
    }

    internal class AdvancedIndicatorSet
    {
        public decimal? BollingerUpper { get; set; }
        public decimal? BollingerLower { get; set; }
        public decimal? BollingerMiddle { get; set; }
        public decimal? BollingerBandwidth { get; set; }
        public decimal? Atr { get; set; }
        public decimal? StochK { get; set; }
        public decimal? StochD { get; set; }
        public decimal? Adx { get; set; }
        public long? Obv { get; set; }
        public string? FibonacciLevels { get; set; }
        public string? PivotLevels { get; set; }
        public decimal? IchimokuTenkan { get; set; }
        public decimal? IchimokuKijun { get; set; }
        public decimal? IchimokuSenkouA { get; set; }
        public decimal? IchimokuSenkouB { get; set; }
        public decimal? IchimokuChikou { get; set; }
    }

    internal record BollingerResult
    {
        public decimal Upper { get; init; }
        public decimal Lower { get; init; }
        public decimal Middle { get; init; }
        public decimal Bandwidth { get; init; }
    }

    internal record StochasticResult
    {
        public decimal K { get; init; }
        public decimal? D { get; init; }
    }

    internal record IchimokuResult
    {
        public decimal Tenkan { get; init; }
        public decimal Kijun { get; init; }
        public decimal SenkouA { get; init; }
        public decimal SenkouB { get; init; }
        public decimal Chikou { get; init; }
    }
}
