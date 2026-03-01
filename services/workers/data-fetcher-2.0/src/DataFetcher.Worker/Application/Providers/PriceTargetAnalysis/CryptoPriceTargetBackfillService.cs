using System.Diagnostics;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public class CryptoPriceTargetBackfillService : ICryptoPriceTargetBackfillService
{
    private readonly ICryptoPriceTargetService _cryptoPriceTargetService;
    private readonly IPriceTargetRepository _priceTargetRepository;
    private readonly ICryptoPriceTargetRepository _cryptoRepository;
    private readonly ICryptoTickerRepository _tickerRepository;
    private readonly IPriceTargetParametersRepository _parametersRepository;
    private readonly ILogger<CryptoPriceTargetBackfillService> _logger;
    private readonly IMetricsClient _metrics;

    public CryptoPriceTargetBackfillService(
        ICryptoPriceTargetService cryptoPriceTargetService,
        IPriceTargetRepository priceTargetRepository,
        ICryptoPriceTargetRepository cryptoRepository,
        ICryptoTickerRepository tickerRepository,
        IPriceTargetParametersRepository parametersRepository,
        ILogger<CryptoPriceTargetBackfillService> logger,
        IMetricsClient metrics)
    {
        _cryptoPriceTargetService = cryptoPriceTargetService;
        _priceTargetRepository = priceTargetRepository;
        _cryptoRepository = cryptoRepository;
        _tickerRepository = tickerRepository;
        _parametersRepository = parametersRepository;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<BackfillResult> BackfillAsync(int cryptoTickerId, string symbol, int days = 90, CancellationToken ct = default)
    {
        var result = new BackfillResult();
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Starting crypto price target backfill for {Symbol} (ID: {Id}) - {Days} days",
            symbol, cryptoTickerId, days);

        try
        {
            var endDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
            var startDate = endDate.AddDays(-days);

            var analyzedDates = (await _cryptoRepository.GetAnalyzedDatesAsync(cryptoTickerId, startDate, endDate)).ToHashSet();

            var traderProfiles = await _parametersRepository.GetAllActiveParametersAsync("crypto");
            var allProfilesComputed = new HashSet<DateOnly>(analyzedDates.Count);

            foreach (var date in analyzedDates)
            {
                var allDone = true;
                foreach (var profile in traderProfiles)
                {
                    var computed = (await _priceTargetRepository.GetComputedDatesAsync(symbol, date, date, profile.TraderType)).Any();
                    if (!computed) { allDone = false; break; }
                }
                if (allDone) allProfilesComputed.Add(date);
            }

            var missingDates = analyzedDates.Except(allProfilesComputed).OrderBy(d => d).ToList();

            result.TotalDates = analyzedDates.Count;
            result.Skipped = allProfilesComputed.Count;

            _logger.LogInformation(
                "Crypto backfill plan for {Symbol}: {Missing} dates to compute, {Skipped} already computed, {Total} total with candlestick data",
                symbol, missingDates.Count, result.Skipped, result.TotalDates);

            if (missingDates.Count == 0)
            {
                _logger.LogInformation("All dates already computed for crypto {Symbol}", symbol);
                result.Duration = stopwatch.Elapsed;
                return result;
            }

            foreach (var date in missingDates)
            {
                if (ct.IsCancellationRequested)
                {
                    _logger.LogWarning("Crypto backfill cancelled for {Symbol} after {Computed} dates", symbol, result.Computed);
                    break;
                }

                try
                {
                    await _cryptoPriceTargetService.CalculateForCryptoAsync(cryptoTickerId, symbol, date, ct);
                    result.Computed++;
                }
                catch (Exception ex)
                {
                    result.Failed++;
                    result.Errors.Add($"{symbol}/{date}: {ex.Message}");
                    _logger.LogError(ex, "Error computing crypto price target for {Symbol} on {Date}", symbol, date);
                }

                await Task.Delay(50, ct);
            }

            stopwatch.Stop();
            result.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Crypto backfill completed for {Symbol}: {Computed} computed, {Skipped} skipped, {Failed} failed, Duration: {Duration:F1}s",
                symbol, result.Computed, result.Skipped, result.Failed, result.Duration.TotalSeconds);

            await _metrics.IncrementCounterAsync("price_target_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["asset_type"] = "crypto",
                    ["status"] = result.Failed == 0 ? "success" : "partial"
                });
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.Duration = stopwatch.Elapsed;
            result.Errors.Add(ex.Message);

            _logger.LogError(ex, "Crypto backfill failed for {Symbol} after {Duration:F1}s",
                symbol, result.Duration.TotalSeconds);

            await _metrics.IncrementCounterAsync("price_target_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["asset_type"] = "crypto",
                    ["status"] = "error"
                });
        }

        return result;
    }

    public async Task<BackfillResult> BackfillAllAsync(int days = 90, CancellationToken ct = default)
    {
        var aggregated = new BackfillResult();
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Starting crypto price target backfill for all active crypto tickers - {Days} days", days);

        try
        {
            var tickers = (await _tickerRepository.GetActiveTickersAsync()).ToList();
            _logger.LogInformation("Found {Count} active crypto tickers for backfill", tickers.Count);

            foreach (var ticker in tickers)
            {
                if (ct.IsCancellationRequested)
                {
                    _logger.LogWarning("Crypto BackfillAll cancelled after processing some tickers");
                    break;
                }

                try
                {
                    var tickerResult = await BackfillAsync(ticker.Id, ticker.Symbol, days, ct);
                    aggregated.TotalDates += tickerResult.TotalDates;
                    aggregated.Computed += tickerResult.Computed;
                    aggregated.Skipped += tickerResult.Skipped;
                    aggregated.Failed += tickerResult.Failed;
                    aggregated.Errors.AddRange(tickerResult.Errors);
                }
                catch (Exception ex)
                {
                    aggregated.Failed++;
                    aggregated.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Crypto BackfillAll error for ticker {Symbol}", ticker.Symbol);
                }
            }

            stopwatch.Stop();
            aggregated.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Crypto BackfillAll completed: {Computed} computed, {Skipped} skipped, {Failed} failed across {TickerCount} tickers, Duration: {Duration:F1}s",
                aggregated.Computed, aggregated.Skipped, aggregated.Failed, tickers.Count, aggregated.Duration.TotalSeconds);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            aggregated.Duration = stopwatch.Elapsed;
            aggregated.Errors.Add($"Crypto BackfillAll failed: {ex.Message}");

            _logger.LogError(ex, "Crypto BackfillAll failed after {Duration:F1}s", aggregated.Duration.TotalSeconds);
        }

        return aggregated;
    }
}
