using System.Diagnostics;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public class PriceTargetService : IPriceTargetService
{
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IPriceTargetRepository _priceTargetRepository;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<PriceTargetService> _logger;

    public PriceTargetService(
        IStockTickerRepository tickerRepository,
        IPriceTargetRepository priceTargetRepository,
        IMetricsClient metrics,
        ILogger<PriceTargetService> logger)
    {
        _tickerRepository = tickerRepository;
        _priceTargetRepository = priceTargetRepository;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<PriceTarget?> CalculateForStockAsync(int stockTickerId, string symbol, DateOnly date, CancellationToken ct = default)
    {
        try
        {
            _logger.LogInformation("Calculating price targets for {Symbol} on {Date}", symbol, date);

            var recentCloses = await _priceTargetRepository.GetRecentDailyClosesAsync(stockTickerId, date, 30);
            var closesList = recentCloses.ToList();

            if (closesList.Count == 0)
            {
                _logger.LogWarning("No daily close data for {Symbol} on {Date}", symbol, date);
                return null;
            }

            var latestClosePrice = closesList.First().Close;
            if (latestClosePrice <= 0)
            {
                _logger.LogWarning("Invalid close price for {Symbol} on {Date}: {Price}", symbol, date, latestClosePrice);
                return null;
            }

            var indicators = await _priceTargetRepository.GetLatestIndicatorAsync(stockTickerId, date);
            var signals = await _priceTargetRepository.GetRecentCandleSignalsAsync(stockTickerId, date, 5);

            var result = PriceTargetCalculator.Calculate(
                closesList.First().Close,
                closesList.Select(c => new PriceTargetCalculator.DailyClose(c.Date, c.Close)).ToList(),
                indicators != null
                    ? new PriceTargetCalculator.IndicatorSnapshot(indicators.Value.Ema20, indicators.Value.Ema50, indicators.Value.Rsi)
                    : null,
                signals.Select(s => new PriceTargetCalculator.CandleSignal(s)).ToList()
            );

            var target = new PriceTarget
            {
                StockTickerId = stockTickerId,
                Symbol = symbol,
                AssetType = "stock",
                AnalysisDate = date,
                LatestClose = result.LatestClose,
                EntryPrice = result.EntryPrice,
                TargetPrice = result.TargetPrice,
                StopLoss = result.StopLoss,
                SignalSummary = result.SignalSummary,
                Confidence = result.Confidence,
                MetadataJson = result.MetadataJson
            };

            await _priceTargetRepository.InsertAsync(target);

            await _metrics.IncrementCounterAsync("price_target_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "success" });

            _logger.LogInformation("Calculated price targets for {Symbol}: entry={Entry}, target={Target}, signal={Signal}",
                symbol, result.EntryPrice, result.TargetPrice, result.SignalSummary);

            return target;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calculating price targets for {Symbol}", symbol);
            await _metrics.IncrementCounterAsync("price_target_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "failed" });
            throw;
        }
    }

    public async Task<BatchPriceTargetResult> CalculateAllStocksAsync(DateOnly date, CancellationToken ct = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = new BatchPriceTargetResult { AnalysisDate = date };

        try
        {
            var tickers = await _tickerRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            result.TotalStocks = tickerList.Count;

            _logger.LogInformation("Starting price target calculation for {Date} - {Count} stocks", date, tickerList.Count);

            foreach (var ticker in tickerList)
            {
                if (ct.IsCancellationRequested) break;

                try
                {
                    var target = await CalculateForStockAsync(ticker.Id, ticker.Symbol, date, ct);
                    if (target != null)
                        result.SuccessCount++;
                    else
                        result.SkippedCount++;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed to calculate targets for {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = result.FailedCount == 0;

            await _metrics.ObserveHistogramAsync("price_target_duration_seconds", result.DurationSeconds);

            _logger.LogInformation(
                "Price target batch completed for {Date}: {Success}/{Total} stocks ({Skipped} skipped), {Duration:F2}s",
                date, result.SuccessCount, result.TotalStocks, result.SkippedCount, result.DurationSeconds);

            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.DurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.Success = false;
            result.Errors.Add($"Batch failed: {ex.Message}");
            _logger.LogError(ex, "Price target batch failed for {Date}", date);
            throw;
        }
    }
}
