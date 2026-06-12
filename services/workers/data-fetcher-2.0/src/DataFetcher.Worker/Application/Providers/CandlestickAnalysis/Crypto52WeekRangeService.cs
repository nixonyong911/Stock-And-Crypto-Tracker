using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public class Crypto52WeekRangeService : ICrypto52WeekRangeService
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly ICryptoTickerRepository _tickerRepo;
    private readonly ICrypto52WeekRangeRepository _rangeRepo;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<Crypto52WeekRangeService> _logger;

    private const int LookbackDays = 365;

    public Crypto52WeekRangeService(
        IAlpacaMarketDataClient apiClient,
        ICryptoTickerRepository tickerRepo,
        ICrypto52WeekRangeRepository rangeRepo,
        IOptions<AlpacaSettings> settings,
        ILogger<Crypto52WeekRangeService> logger)
    {
        _apiClient = apiClient;
        _tickerRepo = tickerRepo;
        _rangeRepo = rangeRepo;
        _settings = settings.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> RefreshAllAsync(CancellationToken cancellationToken = default)
    {
        var tickers = (await _tickerRepo.GetActiveTickersAsync()).ToList();
        if (tickers.Count == 0)
        {
            _logger.LogWarning("No active crypto tickers for 52-week range refresh");
            return 0;
        }

        // The pipeline can fire several times per day; one Alpaca daily-bars
        // sweep per ticker per UTC day is enough for a yearly range.
        var todayUtc = DateTime.UtcNow.Date;
        var alreadyComputed = await _rangeRepo.GetComputedSinceAsync(todayUtc);
        var pending = tickers.Where(t => !alreadyComputed.Contains(t.Id)).ToList();
        if (pending.Count == 0)
        {
            _logger.LogDebug("52-week ranges already computed today for all {Count} crypto tickers", tickers.Count);
            return 0;
        }

        var tickerMap = pending.ToDictionary(t => t.Symbol, t => t.Id);
        var symbols = pending.Select(t => t.Symbol).ToList();
        var end = DateTime.UtcNow;
        var start = end.AddDays(-LookbackDays);

        _logger.LogInformation("Computing 52-week range for {Count} crypto tickers", pending.Count);

        // Accumulate per-symbol extremes across pages (a symbol's bars can
        // span page boundaries when many symbols are batched).
        var barsBySymbol = new Dictionary<string, List<AlpacaBar>>();
        string? pageToken = null;

        do
        {
            cancellationToken.ThrowIfCancellationRequested();

            var response = await _apiClient.GetCryptoBarsAsync(
                symbols, "1Day", start, end,
                _settings.MaxBarsPerRequest, pageToken, cancellationToken);

            if (response?.Bars == null || response.Bars.Count == 0)
                break;

            foreach (var (symbol, bars) in response.Bars)
            {
                if (!barsBySymbol.TryGetValue(symbol, out var list))
                    barsBySymbol[symbol] = list = new List<AlpacaBar>();
                list.AddRange(bars);
            }

            pageToken = response.NextPageToken;
        } while (!string.IsNullOrEmpty(pageToken));

        var count = 0;
        foreach (var (symbol, bars) in barsBySymbol)
        {
            if (!tickerMap.TryGetValue(symbol, out var tickerId))
            {
                _logger.LogWarning("Unknown crypto symbol in 1Day bars response: {Symbol}", symbol);
                continue;
            }

            var range = ComputeRange(tickerId, bars);
            if (range == null)
            {
                _logger.LogWarning("No usable 1Day bars for {Symbol}, skipping 52-week range", symbol);
                continue;
            }

            await _rangeRepo.UpsertAsync(range);
            count++;
        }

        var missing = symbols.Count - count;
        if (missing > 0)
            _logger.LogWarning("52-week range missing for {Missing} of {Total} crypto tickers", missing, symbols.Count);

        _logger.LogInformation("52-week range refreshed for {Count} crypto tickers", count);
        return count;
    }

    /// <summary>
    /// Pure extraction of the 52-week extremes and long moving averages
    /// (SMA-50 / SMA-200 / EMA-50) from a set of daily bars.
    /// Returns null when no bars carry a positive price.
    /// </summary>
    public static Crypto52WeekRange? ComputeRange(int cryptoTickerId, IReadOnlyList<AlpacaBar> bars)
    {
        var ordered = bars
            .Where(b => b.High > 0 && b.Low > 0 && b.Close > 0)
            .OrderBy(b => b.Timestamp)
            .ToList();
        if (ordered.Count == 0) return null;

        AlpacaBar? highBar = null;
        AlpacaBar? lowBar = null;

        foreach (var bar in ordered)
        {
            if (highBar == null || bar.High > highBar.High) highBar = bar;
            if (lowBar == null || bar.Low < lowBar.Low) lowBar = bar;
        }

        if (highBar == null || lowBar == null) return null;

        var closes = ordered.Select(b => (decimal)b.Close).ToList();

        return new Crypto52WeekRange
        {
            CryptoTickerId = cryptoTickerId,
            Week52High = (decimal)highBar.High,
            Week52Low = (decimal)lowBar.Low,
            Week52HighDate = DateOnly.FromDateTime(highBar.Timestamp),
            Week52LowDate = DateOnly.FromDateTime(lowBar.Timestamp),
            Sma50 = TrendMath.Sma(closes, 50),
            Sma200 = TrendMath.Sma(closes, 200),
            Ema50 = TrendMath.Ema(closes, 50, TrendMath.Ema50MinBars),
            CoverageDays = ordered.Count
        };
    }
}
