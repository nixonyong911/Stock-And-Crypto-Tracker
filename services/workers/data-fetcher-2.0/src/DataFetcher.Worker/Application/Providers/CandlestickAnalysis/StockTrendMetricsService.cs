using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public class StockTrendMetricsService : IStockTrendMetricsService
{
    private readonly IEtoroMarketDataClient _apiClient;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IStockTrendMetricsRepository _metricsRepo;
    private readonly ILogger<StockTrendMetricsService> _logger;

    /// <summary>
    /// OneDay candles requested per ticker. 420 trading days ≈ 20 months:
    /// enough for a converged EMA-50 / honest SMA-200 with buffer, while one
    /// request stays well under eToro's per-request candle cap (1000).
    /// </summary>
    public const int BarCount = 420;

    /// <summary>52-week range window, in calendar days.</summary>
    private const int RangeWindowDays = 365;

    public StockTrendMetricsService(
        IEtoroMarketDataClient apiClient,
        IStockTickerRepository tickerRepo,
        IStockTrendMetricsRepository metricsRepo,
        ILogger<StockTrendMetricsService> logger)
    {
        _apiClient = apiClient;
        _tickerRepo = tickerRepo;
        _metricsRepo = metricsRepo;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> RefreshAllAsync(CancellationToken cancellationToken = default)
    {
        var tickers = (await _tickerRepo.GetActiveTickersAsync()).ToList();
        if (tickers.Count == 0)
        {
            _logger.LogWarning("No active stock tickers for trend metrics refresh");
            return 0;
        }

        // One eToro daily-candle sweep per ticker per UTC day is enough; the
        // pipeline can fire several times per day.
        var todayUtc = DateTime.UtcNow.Date;
        var alreadyComputed = await _metricsRepo.GetComputedSinceAsync(todayUtc);

        var withoutEtoroId = tickers
            .Where(t => t.EtoroInstrumentId is null or <= 0)
            .Select(t => t.Symbol)
            .ToList();
        if (withoutEtoroId.Count > 0)
        {
            _logger.LogWarning(
                "Trend metrics skipped for {Count} stock tickers without an eToro instrument id: {Symbols}",
                withoutEtoroId.Count, string.Join(", ", withoutEtoroId));
        }

        var pending = tickers
            .Where(t => t.EtoroInstrumentId is > 0 && !alreadyComputed.Contains(t.Id))
            .ToList();
        if (pending.Count == 0)
        {
            _logger.LogDebug("Trend metrics already computed today for all {Count} stock tickers", tickers.Count);
            return 0;
        }

        _logger.LogInformation("Computing trend metrics for {Count} stock tickers", pending.Count);

        var count = 0;
        foreach (var ticker in pending)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var candles = await _apiClient.GetCandlesAsync(
                ticker.EtoroInstrumentId!.Value, "OneDay", "desc", BarCount, cancellationToken);

            var metrics = ComputeMetrics(ticker.Id, candles, DateTime.UtcNow);
            if (metrics == null)
            {
                _logger.LogWarning("No usable OneDay candles for {Symbol}, skipping trend metrics", ticker.Symbol);
                continue;
            }

            _logger.LogDebug(
                "Trend metrics for {Symbol}: {Bars} bars, coverage {Coverage}d, sma200 {Sma200}",
                ticker.Symbol, candles.Count, metrics.CoverageDays, metrics.Sma200);

            await _metricsRepo.UpsertAsync(metrics);
            count++;
        }

        var missing = pending.Count - count;
        if (missing > 0)
            _logger.LogWarning("Trend metrics missing for {Missing} of {Total} stock tickers", missing, pending.Count);

        _logger.LogInformation("Trend metrics refreshed for {Count} stock tickers", count);
        return count;
    }

    /// <summary>
    /// Pure derivation of the 52-week extremes (trailing 365 calendar days)
    /// and the long moving averages (full series, oldest-first). Returns null
    /// when no bar carries a positive price.
    /// </summary>
    public static StockTrendMetrics? ComputeMetrics(
        int stockTickerId,
        IReadOnlyList<EtoroCandle> candles,
        DateTime nowUtc)
    {
        var ordered = candles
            .Where(c => c.High > 0 && c.Low > 0 && c.Close > 0)
            .OrderBy(c => c.FromDate)
            .ToList();
        if (ordered.Count == 0) return null;

        var windowStart = nowUtc.AddDays(-RangeWindowDays);
        EtoroCandle? highBar = null;
        EtoroCandle? lowBar = null;
        var coverage = 0;

        foreach (var bar in ordered)
        {
            if (bar.FromDate < windowStart) continue;
            coverage++;
            if (highBar == null || bar.High > highBar.High) highBar = bar;
            if (lowBar == null || bar.Low < lowBar.Low) lowBar = bar;
        }

        if (highBar == null || lowBar == null) return null;

        var closes = ordered.Select(c => (decimal)c.Close).ToList();

        return new StockTrendMetrics
        {
            StockTickerId = stockTickerId,
            Week52High = (decimal)highBar.High,
            Week52Low = (decimal)lowBar.Low,
            Week52HighDate = DateOnly.FromDateTime(highBar.FromDate),
            Week52LowDate = DateOnly.FromDateTime(lowBar.FromDate),
            Sma50 = TrendMath.Sma(closes, 50),
            Sma200 = TrendMath.Sma(closes, 200),
            Ema50 = TrendMath.Ema(closes, 50, TrendMath.Ema50MinBars),
            CoverageDays = coverage
        };
    }
}
