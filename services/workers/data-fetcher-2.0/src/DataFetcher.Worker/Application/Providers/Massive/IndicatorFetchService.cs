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

            // 1. Convert date to millisecond epoch timestamps in ET (full extended hours: 4:00 AM - 8:00 PM)
            var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
            var extendedOpen = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 4, 0, 0);
            var extendedClose = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 20, 0, 0);
            var openUtc = TimeZoneInfo.ConvertTimeToUtc(extendedOpen, tz);
            var closeUtc = TimeZoneInfo.ConvertTimeToUtc(extendedClose, tz);
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
        // Legacy wrapper: calls the new per-indicator method for all 4 indicators sequentially.
        _logger.LogInformation(
            "Starting legacy backfill for {Symbol} from {StartDate} to {EndDate}",
            ticker.Symbol, startDate, endDate);

        var totalUpserted = 0;
        var indicatorTypes = new[] { "sma", "ema", "macd", "rsi" };

        foreach (var indicatorType in indicatorTypes)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var count = await FetchBackfillSingleIndicatorAsync(ticker, indicatorType, startDate, endDate, cancellationToken);
                totalUpserted += count;
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("Backfill cancelled for {Symbol}/{Indicator}", ticker.Symbol, indicatorType);
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed backfill for {Symbol}/{Indicator}, continuing", ticker.Symbol, indicatorType);
            }
        }

        _logger.LogInformation(
            "Backfill complete for {Symbol}: {TotalUpserted} indicators across {StartDate} to {EndDate}",
            ticker.Symbol, totalUpserted, startDate, endDate);

        return totalUpserted;
    }

    /// <inheritdoc />
    public async Task<int> FetchBackfillSingleIndicatorAsync(StockTicker ticker, string indicatorType, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var labels = new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["indicator"] = indicatorType };

        try
        {
            _logger.LogInformation(
                "Starting paginated backfill for {Symbol}/{Indicator} from {StartDate} to {EndDate}",
                ticker.Symbol, indicatorType, startDate, endDate);

            // 1. Convert date range to millisecond epoch timestamps (market open first day to market close last day)
            var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
            var marketOpenFirst = new DateTime(startDate.Year, startDate.Month, startDate.Day, 0, 0, 0);
            var marketCloseLast = new DateTime(endDate.Year, endDate.Month, endDate.Day, 23, 59, 59);
            var openUtc = TimeZoneInfo.ConvertTimeToUtc(marketOpenFirst, tz);
            var closeUtc = TimeZoneInfo.ConvertTimeToUtc(marketCloseLast, tz);
            long timestampGte = new DateTimeOffset(openUtc).ToUnixTimeMilliseconds();
            long timestampLte = new DateTimeOffset(closeUtc).ToUnixTimeMilliseconds();

            // 2. Build the initial parameterized URL
            var url = indicatorType switch
            {
                "sma" => _massiveClient.BuildSmaUrl(ticker.Symbol, timestampGte, timestampLte, _settings.SmaWindow),
                "ema" => _massiveClient.BuildEmaUrl(ticker.Symbol, timestampGte, timestampLte, _settings.EmaWindow),
                "macd" => _massiveClient.BuildMacdUrl(ticker.Symbol, timestampGte, timestampLte,
                    _settings.MacdShortWindow, _settings.MacdLongWindow, _settings.MacdSignalWindow),
                "rsi" => _massiveClient.BuildRsiUrl(ticker.Symbol, timestampGte, timestampLte, _settings.RsiWindow),
                _ => throw new ArgumentException($"Unknown indicator type: {indicatorType}")
            };

            var dataSourceId = await GetMassiveDataSourceIdAsync();
            var totalUpserted = 0;
            var pageNumber = 0;

            // 3. Stream-process-upsert loop: fetch page → filter → upsert → next page
            while (url != null && !cancellationToken.IsCancellationRequested)
            {
                pageNumber++;

                // Fetch one page
                var (values, nextUrl) = indicatorType == "macd"
                    ? await FetchMacdPageAsync(url, cancellationToken)
                    : await FetchIndicatorPageAsync(url, indicatorType, cancellationToken);

                if (values.Count == 0)
                {
                    _logger.LogInformation("Page {Page} for {Symbol}/{Indicator}: 0 raw results, ending pagination",
                        pageNumber, ticker.Symbol, indicatorType);
                    break;
                }

                // Filter to 15-min boundaries
                var filtered = FilterTo15MinBoundaries(values, v => v.Timestamp);

                _logger.LogInformation(
                    "Page {Page} for {Symbol}/{Indicator}: {Raw} raw → {Filtered} filtered",
                    pageNumber, ticker.Symbol, indicatorType, values.Count, filtered.Count);

                if (filtered.Count > 0)
                {
                    // Convert to StockIndicator entities and upsert immediately
                    var indicators = ConvertToIndicators(filtered, indicatorType, ticker.Id, dataSourceId);
                    await _indicatorRepo.BulkUpsertAsync(indicators);
                    totalUpserted += filtered.Count;
                }

                // Move to next page or end
                url = nextUrl;
                if (url != null)
                {
                    // Rate limit delay before next API call
                    await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);
                }
            }

            // 4. Cleanup old records
            await _indicatorRepo.DeleteOldRecordsAsync(ticker.Id, RetentionDays);

            // 5. Metrics
            stopwatch.Stop();
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_backfill_pages_total", pageNumber, labels);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_backfill_records_upserted_total", totalUpserted, labels);
            await _metrics.ObserveHistogramAsync($"{MetricsPrefix}_backfill_duration_seconds", stopwatch.Elapsed.TotalSeconds, labels);

            _logger.LogInformation(
                "Paginated backfill complete for {Symbol}/{Indicator}: {Pages} pages, {Count} records upserted in {Duration:F1}s",
                ticker.Symbol, indicatorType, pageNumber, totalUpserted, stopwatch.Elapsed.TotalSeconds);

            return totalUpserted;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Error in paginated backfill for {Symbol}/{Indicator}", ticker.Symbol, indicatorType);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_backfill_errors_total", 1, labels);
            throw;
        }
    }

    /// <summary>
    /// Fetches a single page of SMA/EMA/RSI indicator values and returns them with timestamp accessors.
    /// </summary>
    private async Task<(List<TimestampedValue> Values, string? NextUrl)> FetchIndicatorPageAsync(
        string url, string indicatorType, CancellationToken ct)
    {
        var (values, nextUrl) = await _massiveClient.FetchPageAsync<MassiveIndicatorValue>(url, ct);
        var result = values.Select(v => new TimestampedValue
        {
            Timestamp = v.Timestamp,
            Value = v.Value,
            IndicatorType = indicatorType
        }).ToList();
        return (result, nextUrl);
    }

    /// <summary>
    /// Fetches a single page of MACD indicator values and returns them with timestamp accessors.
    /// </summary>
    private async Task<(List<TimestampedValue> Values, string? NextUrl)> FetchMacdPageAsync(
        string url, CancellationToken ct)
    {
        var (values, nextUrl) = await _massiveClient.FetchPageAsync<MassiveMacdValue>(url, ct);
        var result = values.Select(v => new TimestampedValue
        {
            Timestamp = v.Timestamp,
            MacdValue = v.Value,
            MacdSignal = v.Signal,
            MacdHistogram = v.Histogram,
            IndicatorType = "macd"
        }).ToList();
        return (result, nextUrl);
    }

    /// <summary>
    /// Converts filtered timestamped values into StockIndicator entities, filling only the relevant column.
    /// </summary>
    private static List<StockIndicator> ConvertToIndicators(
        List<TimestampedValue> values, string indicatorType, int tickerId, int dataSourceId)
    {
        return values.Select(v =>
        {
            var indicator = new StockIndicator
            {
                StockTickerId = tickerId,
                DataSourceId = dataSourceId,
                IndicatorTime = DateTimeOffset.FromUnixTimeMilliseconds(v.Timestamp).UtcDateTime
            };

            switch (indicatorType)
            {
                case "sma":
                    indicator.Sma = v.Value;
                    break;
                case "ema":
                    indicator.Ema = v.Value;
                    break;
                case "macd":
                    indicator.MacdValue = v.MacdValue;
                    indicator.MacdSignal = v.MacdSignal;
                    indicator.MacdHistogram = v.MacdHistogram;
                    break;
                case "rsi":
                    indicator.Rsi = v.Value;
                    break;
            }

            return indicator;
        }).ToList();
    }

    /// <summary>
    /// Internal value type for the stream-process-upsert loop, unifying SMA/EMA/RSI and MACD values.
    /// </summary>
    private class TimestampedValue
    {
        public long Timestamp { get; set; }
        public string IndicatorType { get; set; } = string.Empty;
        // For SMA/EMA/RSI
        public decimal? Value { get; set; }
        // For MACD
        public decimal? MacdValue { get; set; }
        public decimal? MacdSignal { get; set; }
        public decimal? MacdHistogram { get; set; }
    }

    /// <summary>
    /// Filters indicator values to only those falling on 15-minute boundaries within extended hours (04:00-20:00 ET).
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

            return minute % 15 == 0
                && totalMinutes >= 4 * 60         // >= 04:00 (pre-market open)
                && totalMinutes <= 20 * 60;        // <= 20:00 (post-market close)
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
