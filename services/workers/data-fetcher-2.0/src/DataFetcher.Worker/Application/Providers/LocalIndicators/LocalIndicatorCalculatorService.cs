using System.Diagnostics;
using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.LocalIndicators;

public class LocalIndicatorCalculatorService : ILocalIndicatorCalculatorService
{
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly IStockTickerRepository _stockTickerRepo;
    private readonly ICryptoTickerRepository _cryptoTickerRepo;
    private readonly IStockIndicatorRepository _stockIndicatorRepo;
    private readonly ICryptoIndicatorRepository _cryptoIndicatorRepo;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<LocalIndicatorCalculatorService> _logger;

    private int? _dataSourceId;
    private const int MinDataPoints = 14;
    private const int LookbackDays = 50;
    private const string MetricsPrefix = "local_indicator";

    public LocalIndicatorCalculatorService(
        IDbConnectionFactory dbConnectionFactory,
        IStockTickerRepository stockTickerRepo,
        ICryptoTickerRepository cryptoTickerRepo,
        IStockIndicatorRepository stockIndicatorRepo,
        ICryptoIndicatorRepository cryptoIndicatorRepo,
        IMetricsClient metrics,
        ILogger<LocalIndicatorCalculatorService> logger)
    {
        _dbConnectionFactory = dbConnectionFactory;
        _stockTickerRepo = stockTickerRepo;
        _cryptoTickerRepo = cryptoTickerRepo;
        _stockIndicatorRepo = stockIndicatorRepo;
        _cryptoIndicatorRepo = cryptoIndicatorRepo;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<BatchIndicatorResult> ComputeAllStockIndicatorsAsync(CancellationToken cancellationToken = default)
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
                    var closes = await GetStockDailyClosesAsync(ticker.Id, LookbackDays);
                    if (closes.Count < MinDataPoints)
                    {
                        result.SkippedCount++;
                        continue;
                    }

                    var computed = ComputeIndicators(closes);

                    var indicator = new StockIndicator
                    {
                        StockTickerId = ticker.Id,
                        DataSourceId = dataSourceId,
                        IndicatorTime = DateTime.UtcNow,
                        Sma = computed.Sma,
                        Ema = computed.Ema,
                        MacdValue = computed.MacdValue,
                        MacdSignal = computed.MacdSignal,
                        MacdHistogram = computed.MacdHistogram,
                        Rsi = computed.Rsi
                    };

                    await _stockIndicatorRepo.BulkUpsertAsync(new[] { indicator });
                    result.SuccessCount++;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed computing indicators for {Symbol}", ticker.Symbol);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed batch stock indicator computation");
            result.Errors.Add($"Batch error: {ex.Message}");
        }

        sw.Stop();
        result.DurationSeconds = sw.Elapsed.TotalSeconds;
        return result;
    }

    public async Task<BatchIndicatorResult> ComputeAllCryptoIndicatorsAsync(CancellationToken cancellationToken = default)
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
                    var closes = await GetCryptoDailyClosesAsync(ticker.Id, LookbackDays);
                    if (closes.Count < MinDataPoints)
                    {
                        result.SkippedCount++;
                        continue;
                    }

                    var computed = ComputeIndicators(closes);

                    var indicator = new CryptoIndicator
                    {
                        CryptoTickerId = ticker.Id,
                        DataSourceId = dataSourceId,
                        IndicatorTime = DateTime.UtcNow,
                        Sma = computed.Sma,
                        Ema = computed.Ema,
                        MacdValue = computed.MacdValue,
                        MacdSignal = computed.MacdSignal,
                        MacdHistogram = computed.MacdHistogram,
                        Rsi = computed.Rsi
                    };

                    await _cryptoIndicatorRepo.BulkUpsertAsync(new[] { indicator });
                    result.SuccessCount++;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed computing crypto indicators for {Symbol}", ticker.Symbol);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed batch crypto indicator computation");
            result.Errors.Add($"Batch error: {ex.Message}");
        }

        sw.Stop();
        result.DurationSeconds = sw.Elapsed.TotalSeconds;
        return result;
    }

    /// <summary>
    /// Computes all indicators from a chronologically-ordered list of daily close prices.
    /// </summary>
    internal static IndicatorSet ComputeIndicators(List<decimal> closes)
    {
        var set = new IndicatorSet();
        var n = closes.Count;
        if (n == 0) return set;

        // SMA-20
        if (n >= 20)
            set.Sma = Math.Round(closes.Skip(n - 20).Average(), 6);

        // EMA-20
        set.Ema = ComputeEma(closes, 20);

        // MACD: EMA-12 minus EMA-26, signal = EMA-9 of MACD series
        if (n >= 26)
        {
            var ema12Series = ComputeEmaSeries(closes, 12);
            var ema26Series = ComputeEmaSeries(closes, 26);

            var minLen = Math.Min(ema12Series.Count, ema26Series.Count);
            var offset12 = ema12Series.Count - minLen;
            var offset26 = ema26Series.Count - minLen;

            var macdSeries = new List<decimal>(minLen);
            for (int i = 0; i < minLen; i++)
                macdSeries.Add(ema12Series[offset12 + i] - ema26Series[offset26 + i]);

            set.MacdValue = Math.Round(macdSeries[^1], 6);

            if (macdSeries.Count >= 9)
            {
                var signalSeries = ComputeEmaSeries(macdSeries, 9);
                set.MacdSignal = Math.Round(signalSeries[^1], 6);
                set.MacdHistogram = Math.Round(set.MacdValue.Value - set.MacdSignal.Value, 6);
            }
        }

        // RSI-14 using Wilder's smoothing
        if (n >= 15)
            set.Rsi = ComputeRsi(closes, 14);

        return set;
    }

    internal static decimal? ComputeEma(List<decimal> values, int period)
    {
        if (values.Count < period) return null;
        var series = ComputeEmaSeries(values, period);
        return series.Count > 0 ? Math.Round(series[^1], 6) : null;
    }

    /// <summary>
    /// Returns the full EMA series starting from the first period's SMA bootstrap.
    /// Input must be in chronological order (oldest first).
    /// </summary>
    internal static List<decimal> ComputeEmaSeries(List<decimal> values, int period)
    {
        if (values.Count < period) return new List<decimal>();

        var multiplier = 2.0m / (period + 1);
        var result = new List<decimal>(values.Count - period + 1);

        var sma = values.Take(period).Average();
        result.Add(sma);

        for (int i = period; i < values.Count; i++)
        {
            var ema = (values[i] - result[^1]) * multiplier + result[^1];
            result.Add(ema);
        }

        return result;
    }

    /// <summary>
    /// RSI using Wilder's smoothing method. Returns 0-100 scale.
    /// </summary>
    internal static decimal ComputeRsi(List<decimal> closes, int period)
    {
        var gains = new List<decimal>();
        var losses = new List<decimal>();

        for (int i = 1; i < closes.Count; i++)
        {
            var change = closes[i] - closes[i - 1];
            gains.Add(change > 0 ? change : 0);
            losses.Add(change < 0 ? -change : 0);
        }

        if (gains.Count < period) return 50m;

        var avgGain = gains.Take(period).Average();
        var avgLoss = losses.Take(period).Average();

        for (int i = period; i < gains.Count; i++)
        {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        }

        if (avgLoss == 0) return 100m;
        var rs = avgGain / avgLoss;
        return Math.Round(100m - (100m / (1m + rs)), 4);
    }

    private async Task<List<decimal>> GetStockDailyClosesAsync(int stockTickerId, int days)
    {
        using var connection = _dbConnectionFactory.CreateConnection();

        const string sql = @"
            SELECT daily_close
            FROM analysis_stock_candlestick_pattern
            WHERE stock_ticker_id = @StockTickerId
              AND daily_close IS NOT NULL
            ORDER BY analysis_date ASC
            LIMIT @Days";

        var rows = await connection.QueryAsync<decimal>(sql, new { StockTickerId = stockTickerId, Days = days });
        return rows.ToList();
    }

    private async Task<List<decimal>> GetCryptoDailyClosesAsync(int cryptoTickerId, int days)
    {
        using var connection = _dbConnectionFactory.CreateConnection();

        const string sql = @"
            SELECT daily_close
            FROM analysis_crypto_candlestick_pattern
            WHERE crypto_ticker_id = @CryptoTickerId
              AND daily_close IS NOT NULL
            ORDER BY analysis_date ASC
            LIMIT @Days";

        var rows = await connection.QueryAsync<decimal>(sql, new { CryptoTickerId = cryptoTickerId, Days = days });
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

    internal class IndicatorSet
    {
        public decimal? Sma { get; set; }
        public decimal? Ema { get; set; }
        public decimal? MacdValue { get; set; }
        public decimal? MacdSignal { get; set; }
        public decimal? MacdHistogram { get; set; }
        public decimal? Rsi { get; set; }
    }
}
