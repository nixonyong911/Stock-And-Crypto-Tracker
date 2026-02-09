using System.Diagnostics;
using Dapper;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Providers.Massive;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Models;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Massive;

/// <summary>
/// Orchestrates fetching technical indicators from the Massive API,
/// filtering to 15-minute boundaries, merging, and storing.
/// </summary>
public class IndicatorFetchService : IIndicatorFetchService
{
    private readonly IMassiveApiClient _massiveClient;
    private readonly IStockIndicatorRepository _indicatorRepo;
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly MassiveSettings _settings;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<IndicatorFetchService> _logger;
    private const string MetricsPrefix = "data_fetcher_2_massive";
    private const int RetentionDays = 90;

    private int? _massiveDataSourceId;

    public IndicatorFetchService(
        IMassiveApiClient massiveClient,
        IStockIndicatorRepository indicatorRepo,
        IDbConnectionFactory dbConnectionFactory,
        IOptions<MassiveSettings> settings,
        IMetricsClient metrics,
        ILogger<IndicatorFetchService> logger)
    {
        _massiveClient = massiveClient;
        _indicatorRepo = indicatorRepo;
        _dbConnectionFactory = dbConnectionFactory;
        _settings = settings.Value;
        _metrics = metrics;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> FetchDailyIndicatorsAsync(StockTicker ticker, DateOnly targetDate, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var labels = new Dictionary<string, string> { ["symbol"] = ticker.Symbol };

        try
        {
            _logger.LogInformation("Fetching indicators for {Symbol} on {Date}", ticker.Symbol, targetDate);

            // 1. Convert date to millisecond epoch timestamps in ET
            var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
            var marketOpen = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 9, 30, 0);
            var marketClose = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 16, 0, 0);
            var openUtc = TimeZoneInfo.ConvertTimeToUtc(marketOpen, tz);
            var closeUtc = TimeZoneInfo.ConvertTimeToUtc(marketClose, tz);
            long timestampGte = new DateTimeOffset(openUtc).ToUnixTimeMilliseconds();
            long timestampLte = new DateTimeOffset(closeUtc).ToUnixTimeMilliseconds();

            // 2. Call all 4 Massive API endpoints with rate-limit delay between each
            var smaResponse = await _massiveClient.GetSmaAsync(
                ticker.Symbol, timestampGte, timestampLte, _settings.SmaWindow, _settings.Limit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            var emaResponse = await _massiveClient.GetEmaAsync(
                ticker.Symbol, timestampGte, timestampLte, _settings.EmaWindow, _settings.Limit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            var macdResponse = await _massiveClient.GetMacdAsync(
                ticker.Symbol, timestampGte, timestampLte,
                _settings.MacdShortWindow, _settings.MacdLongWindow, _settings.MacdSignalWindow,
                _settings.Limit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            var rsiResponse = await _massiveClient.GetRsiAsync(
                ticker.Symbol, timestampGte, timestampLte, _settings.RsiWindow, _settings.Limit, cancellationToken);
            // Delay after LAST call too — ensures rate limit is respected at message boundaries
            // (next message from queue consumer will fire immediately after this method returns)
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            // 3. Filter to 15-min boundaries
            var filteredSma = FilterTo15MinBoundaries(smaResponse?.Results?.Values, v => v.Timestamp);
            var filteredEma = FilterTo15MinBoundaries(emaResponse?.Results?.Values, v => v.Timestamp);
            var filteredMacd = FilterTo15MinBoundaries(macdResponse?.Results?.Values, v => v.Timestamp);
            var filteredRsi = FilterTo15MinBoundaries(rsiResponse?.Results?.Values, v => v.Timestamp);

            _logger.LogDebug(
                "Filtered indicators for {Symbol} on {Date}: SMA={SmaCount}, EMA={EmaCount}, MACD={MacdCount}, RSI={RsiCount}",
                ticker.Symbol, targetDate, filteredSma.Count, filteredEma.Count, filteredMacd.Count, filteredRsi.Count);

            // 4. Merge indicators by timestamp
            var dataSourceId = await GetMassiveDataSourceIdAsync();
            var indicators = new Dictionary<long, StockIndicator>();

            foreach (var v in filteredSma)
                GetOrCreate(indicators, v.Timestamp, ticker.Id, dataSourceId).Sma = v.Value;

            foreach (var v in filteredEma)
                GetOrCreate(indicators, v.Timestamp, ticker.Id, dataSourceId).Ema = v.Value;

            foreach (var v in filteredMacd)
            {
                var ind = GetOrCreate(indicators, v.Timestamp, ticker.Id, dataSourceId);
                ind.MacdValue = v.Value;
                ind.MacdSignal = v.Signal;
                ind.MacdHistogram = v.Histogram;
            }

            foreach (var v in filteredRsi)
                GetOrCreate(indicators, v.Timestamp, ticker.Id, dataSourceId).Rsi = v.Value;

            var count = indicators.Count;

            if (count == 0)
            {
                _logger.LogWarning("No indicator data after filtering for {Symbol} on {Date}", ticker.Symbol, targetDate);
                await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_operations_total", 1,
                    new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "no_data" });
                return 0;
            }

            // 5. Bulk upsert and cleanup
            await _indicatorRepo.BulkUpsertAsync(indicators.Values);
            await _indicatorRepo.DeleteOldRecordsAsync(ticker.Id, RetentionDays);

            // 6. Track metrics
            stopwatch.Stop();
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "success" });
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_records_upserted_total", count, labels);
            await _metrics.ObserveHistogramAsync($"{MetricsPrefix}_fetch_duration_seconds", stopwatch.Elapsed.TotalSeconds, labels);

            _logger.LogInformation(
                "Successfully fetched {Count} indicators for {Symbol} on {Date}",
                count, ticker.Symbol, targetDate);

            // 7. Return count
            return count;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Error fetching indicators for {Symbol} on {Date}", ticker.Symbol, targetDate);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["error_type"] = ex.GetType().Name });
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<int> FetchBackfillIndicatorsAsync(StockTicker ticker, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "Starting backfill for {Symbol} from {StartDate} to {EndDate}",
            ticker.Symbol, startDate, endDate);

        var totalUpserted = 0;

        for (var date = startDate; date <= endDate; date = date.AddDays(1))
        {
            if (cancellationToken.IsCancellationRequested)
                break;

            // Skip weekends — no market data
            if (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
                continue;

            try
            {
                var count = await FetchDailyIndicatorsAsync(ticker, date, cancellationToken);
                totalUpserted += count;
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("Backfill cancelled for {Symbol} on {Date}", ticker.Symbol, date);
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch indicators for {Symbol} on {Date}, continuing", ticker.Symbol, date);
            }
        }

        _logger.LogInformation(
            "Backfill complete for {Symbol}: {TotalUpserted} indicators across {StartDate} to {EndDate}",
            ticker.Symbol, totalUpserted, startDate, endDate);

        return totalUpserted;
    }

    /// <summary>
    /// Filters indicator values to only those falling on 15-minute boundaries within market hours (09:30-15:45 ET).
    /// </summary>
    private List<T> FilterTo15MinBoundaries<T>(List<T>? values, Func<T, long> getTimestamp)
    {
        if (values == null || values.Count == 0)
            return new List<T>();

        var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

        return values.Where(v =>
        {
            var dt = DateTimeOffset.FromUnixTimeMilliseconds(getTimestamp(v));
            var etTime = TimeZoneInfo.ConvertTime(dt, tz);
            var minute = etTime.Minute;
            var hour = etTime.Hour;
            var totalMinutes = hour * 60 + minute;

            // Must be on 15-min boundary AND within 09:30-15:45 ET
            return minute % 15 == 0
                && totalMinutes >= 9 * 60 + 30   // >= 09:30
                && totalMinutes <= 15 * 60 + 45;  // <= 15:45
        }).ToList();
    }

    /// <summary>
    /// Gets or creates a <see cref="StockIndicator"/> entry in the merge dictionary for a given timestamp.
    /// </summary>
    private static StockIndicator GetOrCreate(Dictionary<long, StockIndicator> dict, long timestamp, int tickerId, int dataSourceId)
    {
        if (!dict.TryGetValue(timestamp, out var indicator))
        {
            indicator = new StockIndicator
            {
                StockTickerId = tickerId,
                DataSourceId = dataSourceId,
                IndicatorTime = DateTimeOffset.FromUnixTimeMilliseconds(timestamp).UtcDateTime
            };
            dict[timestamp] = indicator;
        }
        return indicator;
    }

    /// <summary>
    /// Resolves the Massive data source ID from the lookup_data_sources table, caching the result.
    /// </summary>
    private async Task<int> GetMassiveDataSourceIdAsync()
    {
        if (_massiveDataSourceId.HasValue)
            return _massiveDataSourceId.Value;

        using var conn = _dbConnectionFactory.CreateConnection();
        _massiveDataSourceId = await conn.QuerySingleAsync<int>(
            "SELECT id FROM lookup_data_sources WHERE name = 'Massive'");

        return _massiveDataSourceId.Value;
    }
}
