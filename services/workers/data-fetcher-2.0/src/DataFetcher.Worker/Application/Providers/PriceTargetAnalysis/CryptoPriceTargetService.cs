using System.Diagnostics;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public class CryptoPriceTargetService : ICryptoPriceTargetService
{
    /// <summary>Trend metrics older than this are treated as missing.</summary>
    private const int TrendMaxAgeDays = 7;

    private readonly ICryptoTickerRepository _tickerRepository;
    private readonly ICryptoPriceTargetRepository _cryptoRepository;
    private readonly IPriceTargetRepository _priceTargetRepository;
    private readonly IPriceTargetParametersRepository _parametersRepository;
    private readonly IPriceTargetCalculatorService _calculator;
    private readonly ICrypto52WeekRangeRepository _rangeRepository;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<CryptoPriceTargetService> _logger;

    public CryptoPriceTargetService(
        ICryptoTickerRepository tickerRepository,
        ICryptoPriceTargetRepository cryptoRepository,
        IPriceTargetRepository priceTargetRepository,
        IPriceTargetParametersRepository parametersRepository,
        IPriceTargetCalculatorService calculator,
        ICrypto52WeekRangeRepository rangeRepository,
        IMetricsClient metrics,
        ILogger<CryptoPriceTargetService> logger)
    {
        _tickerRepository = tickerRepository;
        _cryptoRepository = cryptoRepository;
        _priceTargetRepository = priceTargetRepository;
        _parametersRepository = parametersRepository;
        _calculator = calculator;
        _rangeRepository = rangeRepository;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<PriceTarget?> CalculateForCryptoAsync(int cryptoTickerId, string symbol, DateOnly date, CancellationToken ct = default)
    {
        try
        {
            _logger.LogInformation("Calculating crypto price targets for {Symbol} on {Date}", symbol, date);

            var recentCloses = await _cryptoRepository.GetRecentDailyClosesAsync(cryptoTickerId, date, 60);
            var closesList = recentCloses.ToList();

            if (closesList.Count == 0)
            {
                _logger.LogWarning("No daily close data for crypto {Symbol} on {Date}", symbol, date);
                return null;
            }

            var latestRow = closesList.First();
            var latestClosePrice = latestRow.Close;
            var latestOpenPrice = latestRow.Open;
            if (latestClosePrice <= 0)
            {
                _logger.LogWarning("Invalid close price for crypto {Symbol} on {Date}: {Price}", symbol, date, latestClosePrice);
                return null;
            }

            var indicators = await _cryptoRepository.GetLatestIndicatorAsync(cryptoTickerId, date);
            var signals = await _cryptoRepository.GetRecentCandleSignalsAsync(cryptoTickerId, date, 5);

            var indicatorSnapshot = indicators != null
                ? new PriceTargetCalculatorService.IndicatorSnapshot(indicators.Value.Ema20, indicators.Value.Sma20, indicators.Value.Rsi)
                : null;
            var dailyCloses = closesList.Select(c => new PriceTargetCalculatorService.DailyClose(c.Date, c.Close)).ToList();
            var candleSignals = signals.Select(s => new PriceTargetCalculatorService.CandleSignal(s)).ToList();

            var trendRange = await _rangeRepository.GetLatestAsync(cryptoTickerId, TrendMaxAgeDays);
            var longTrend = trendRange != null
                ? new PriceTargetCalculatorService.LongTrendSnapshot(trendRange.Sma50, trendRange.Sma200, trendRange.Ema50)
                : null;

            var traderProfiles = await _parametersRepository.GetAllActiveParametersAsync("crypto");
            PriceTarget? lastTarget = null;

            foreach (var parameters in traderProfiles)
            {
                var result = _calculator.Calculate(latestClosePrice, dailyCloses, indicatorSnapshot, candleSignals, parameters, longTrend);

                var target = new PriceTarget
                {
                    TickerId = cryptoTickerId,
                    Symbol = symbol,
                    AssetType = "crypto",
                    TraderType = parameters.TraderType,
                    AnalysisDate = date,
                    LatestClose = result.LatestClose,
                    LatestOpen = latestOpenPrice,
                    EntryPrice = result.EntryPrice,
                    EntryPriceLow = result.EntryPriceLow,
                    EntryPriceHigh = result.EntryPriceHigh,
                    TargetPrice = result.TargetPrice,
                    StopLoss = result.StopLoss,
                    SignalSummary = result.SignalSummary,
                    Confidence = result.Confidence,
                    MetadataJson = result.MetadataJson
                };

                await _priceTargetRepository.InsertAsync(target);
                lastTarget = target;
            }

            await _metrics.IncrementCounterAsync("price_target_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "success", ["asset_type"] = "crypto" });

            _logger.LogInformation("Calculated crypto price targets for {Symbol} ({Profiles} profiles)", symbol, traderProfiles.Count);

            return lastTarget;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calculating crypto price targets for {Symbol}", symbol);
            await _metrics.IncrementCounterAsync("price_target_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "failed", ["asset_type"] = "crypto" });
            throw;
        }
    }

    public async Task<BatchPriceTargetResult> CalculateAllCryptoAsync(DateOnly date, CancellationToken ct = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new BatchPriceTargetResult { AnalysisDate = date };

        try
        {
            var tickers = await _tickerRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalStocks = tickerList.Count;

            _logger.LogInformation("Starting crypto price target calculation for {Date} - {Count} tickers", date, tickerList.Count);

            foreach (var ticker in tickerList)
            {
                if (ct.IsCancellationRequested) break;

                try
                {
                    var target = await CalculateForCryptoAsync(ticker.Id, ticker.Symbol, date, ct);
                    if (target != null)
                        result.SuccessCount++;
                    else
                        result.SkippedCount++;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed to calculate crypto targets for {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            await _metrics.ObserveHistogramAsync("crypto_price_target_duration_seconds", result.DurationSeconds);

            _logger.LogInformation(
                "Crypto price target batch completed for {Date}: {Success}/{Total} tickers ({Skipped} skipped), {Duration:F2}s",
                date, result.SuccessCount, result.TotalStocks, result.SkippedCount, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Crypto batch failed: {ex.Message}");
            _logger.LogError(ex, "Crypto price target batch failed for {Date}", date);
            throw;
        }
    }
}
