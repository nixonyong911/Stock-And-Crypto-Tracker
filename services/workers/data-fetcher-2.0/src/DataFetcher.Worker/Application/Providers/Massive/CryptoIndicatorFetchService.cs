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
/// Fetches technical indicators from the Massive API for crypto tickers.
/// Key differences from stock: 24/7 trading (no market hours filter), UTC timezone,
/// symbol mapping (DB "BTC/USD" → API "X:BTCUSD"), 96 data points/day (vs 390 for stock).
/// </summary>
public class CryptoIndicatorFetchService : ICryptoIndicatorFetchService
{
    private readonly IMassiveApiClient _massiveClient;
    private readonly ICryptoIndicatorRepository _indicatorRepo;
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly MassiveSettings _settings;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<CryptoIndicatorFetchService> _logger;
    private const string MetricsPrefix = "data_fetcher_2_massive_crypto";
    private const int RetentionDays = 90;
    private const int CryptoDailyLimit = 96;

    private int? _massiveDataSourceId;

    public CryptoIndicatorFetchService(
        IMassiveApiClient massiveClient,
        ICryptoIndicatorRepository indicatorRepo,
        IDbConnectionFactory dbConnectionFactory,
        IOptions<MassiveSettings> settings,
        IMetricsClient metrics,
        ILogger<CryptoIndicatorFetchService> logger)
    {
        _massiveClient = massiveClient;
        _indicatorRepo = indicatorRepo;
        _dbConnectionFactory = dbConnectionFactory;
        _settings = settings.Value;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<int> FetchDailyIndicatorsAsync(CryptoTicker ticker, DateOnly targetDate, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var apiSymbol = ticker.ToMassiveSymbol();
        var labels = new Dictionary<string, string> { ["symbol"] = ticker.Symbol };

        try
        {
            _logger.LogInformation("Fetching crypto indicators for {Symbol} ({ApiSymbol}) on {Date}",
                ticker.Symbol, apiSymbol, targetDate);

            // Crypto trades 24/7 in UTC — full day boundaries
            var dayStart = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 0, 0, 0, DateTimeKind.Utc);
            var dayEnd = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 23, 59, 59, DateTimeKind.Utc);
            long timestampGte = new DateTimeOffset(dayStart).ToUnixTimeMilliseconds();
            long timestampLte = new DateTimeOffset(dayEnd).ToUnixTimeMilliseconds();

            var smaResponse = await _massiveClient.GetSmaAsync(
                apiSymbol, timestampGte, timestampLte, _settings.SmaWindow, CryptoDailyLimit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            var emaResponse = await _massiveClient.GetEmaAsync(
                apiSymbol, timestampGte, timestampLte, _settings.EmaWindow, CryptoDailyLimit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            var macdResponse = await _massiveClient.GetMacdAsync(
                apiSymbol, timestampGte, timestampLte,
                _settings.MacdShortWindow, _settings.MacdLongWindow, _settings.MacdSignalWindow,
                CryptoDailyLimit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            var rsiResponse = await _massiveClient.GetRsiAsync(
                apiSymbol, timestampGte, timestampLte, _settings.RsiWindow, CryptoDailyLimit, cancellationToken);
            await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);

            // Filter to 15-min boundaries only (no market hours restriction for crypto)
            var filteredSma = FilterTo15MinBoundaries(smaResponse?.Results?.Values);
            var filteredEma = FilterTo15MinBoundaries(emaResponse?.Results?.Values);
            var filteredMacd = FilterTo15MinBoundaries(macdResponse?.Results?.Values);
            var filteredRsi = FilterTo15MinBoundaries(rsiResponse?.Results?.Values);

            _logger.LogDebug(
                "Filtered crypto indicators for {Symbol} on {Date}: SMA={SmaCount}, EMA={EmaCount}, MACD={MacdCount}, RSI={RsiCount}",
                ticker.Symbol, targetDate, filteredSma.Count, filteredEma.Count, filteredMacd.Count, filteredRsi.Count);

            var dataSourceId = await GetMassiveDataSourceIdAsync();
            var indicators = new Dictionary<long, CryptoIndicator>();

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
                _logger.LogWarning("No crypto indicator data after filtering for {Symbol} on {Date}", ticker.Symbol, targetDate);
                await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_operations_total", 1,
                    new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "no_data" });
                return 0;
            }

            await _indicatorRepo.BulkUpsertAsync(indicators.Values);
            await _indicatorRepo.DeleteOldRecordsAsync(ticker.Id, RetentionDays);

            stopwatch.Stop();
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "success" });
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_records_upserted_total", count, labels);
            await _metrics.ObserveHistogramAsync($"{MetricsPrefix}_fetch_duration_seconds", stopwatch.Elapsed.TotalSeconds, labels);

            _logger.LogInformation(
                "Successfully fetched {Count} crypto indicators for {Symbol} on {Date}",
                count, ticker.Symbol, targetDate);

            return count;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Error fetching crypto indicators for {Symbol} on {Date}", ticker.Symbol, targetDate);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["error_type"] = ex.GetType().Name });
            throw;
        }
    }

    public async Task<int> FetchBackfillIndicatorsAsync(CryptoTicker ticker, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "Starting crypto backfill for {Symbol} from {StartDate} to {EndDate}",
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
                _logger.LogWarning("Crypto backfill cancelled for {Symbol}/{Indicator}", ticker.Symbol, indicatorType);
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed crypto backfill for {Symbol}/{Indicator}, continuing", ticker.Symbol, indicatorType);
            }
        }

        _logger.LogInformation(
            "Crypto backfill complete for {Symbol}: {TotalUpserted} indicators across {StartDate} to {EndDate}",
            ticker.Symbol, totalUpserted, startDate, endDate);

        return totalUpserted;
    }

    public async Task<int> FetchBackfillSingleIndicatorAsync(CryptoTicker ticker, string indicatorType, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var apiSymbol = ticker.ToMassiveSymbol();
        var labels = new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["indicator"] = indicatorType };

        try
        {
            _logger.LogInformation(
                "Starting paginated crypto backfill for {Symbol} ({ApiSymbol})/{Indicator} from {StartDate} to {EndDate}",
                ticker.Symbol, apiSymbol, indicatorType, startDate, endDate);

            // Crypto uses UTC full-day boundaries
            var dayStart = new DateTime(startDate.Year, startDate.Month, startDate.Day, 0, 0, 0, DateTimeKind.Utc);
            var dayEnd = new DateTime(endDate.Year, endDate.Month, endDate.Day, 23, 59, 59, DateTimeKind.Utc);
            long timestampGte = new DateTimeOffset(dayStart).ToUnixTimeMilliseconds();
            long timestampLte = new DateTimeOffset(dayEnd).ToUnixTimeMilliseconds();

            var url = indicatorType switch
            {
                "sma" => _massiveClient.BuildSmaUrl(apiSymbol, timestampGte, timestampLte, _settings.SmaWindow),
                "ema" => _massiveClient.BuildEmaUrl(apiSymbol, timestampGte, timestampLte, _settings.EmaWindow),
                "macd" => _massiveClient.BuildMacdUrl(apiSymbol, timestampGte, timestampLte,
                    _settings.MacdShortWindow, _settings.MacdLongWindow, _settings.MacdSignalWindow),
                "rsi" => _massiveClient.BuildRsiUrl(apiSymbol, timestampGte, timestampLte, _settings.RsiWindow),
                _ => throw new ArgumentException($"Unknown indicator type: {indicatorType}")
            };

            var dataSourceId = await GetMassiveDataSourceIdAsync();
            var totalUpserted = 0;
            var pageNumber = 0;

            while (url != null && !cancellationToken.IsCancellationRequested)
            {
                pageNumber++;

                var (values, nextUrl) = indicatorType == "macd"
                    ? await FetchMacdPageAsync(url, cancellationToken)
                    : await FetchIndicatorPageAsync(url, indicatorType, cancellationToken);

                if (values.Count == 0)
                {
                    _logger.LogInformation("Page {Page} for {Symbol}/{Indicator}: 0 raw results, ending pagination",
                        pageNumber, ticker.Symbol, indicatorType);
                    break;
                }

                var filtered = FilterTo15MinBoundaries(values);

                _logger.LogInformation(
                    "Page {Page} for {Symbol}/{Indicator}: {Raw} raw → {Filtered} filtered",
                    pageNumber, ticker.Symbol, indicatorType, values.Count, filtered.Count);

                if (filtered.Count > 0)
                {
                    var indicators = ConvertToIndicators(filtered, indicatorType, ticker.Id, dataSourceId);
                    await _indicatorRepo.BulkUpsertAsync(indicators);
                    totalUpserted += filtered.Count;
                }

                url = nextUrl;
                if (url != null)
                {
                    await Task.Delay(_settings.RateLimitDelayMs, cancellationToken);
                }
            }

            await _indicatorRepo.DeleteOldRecordsAsync(ticker.Id, RetentionDays);

            stopwatch.Stop();
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_backfill_pages_total", pageNumber, labels);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_backfill_records_upserted_total", totalUpserted, labels);
            await _metrics.ObserveHistogramAsync($"{MetricsPrefix}_backfill_duration_seconds", stopwatch.Elapsed.TotalSeconds, labels);

            _logger.LogInformation(
                "Paginated crypto backfill complete for {Symbol}/{Indicator}: {Pages} pages, {Count} records in {Duration:F1}s",
                ticker.Symbol, indicatorType, pageNumber, totalUpserted, stopwatch.Elapsed.TotalSeconds);

            return totalUpserted;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Error in paginated crypto backfill for {Symbol}/{Indicator}", ticker.Symbol, indicatorType);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_backfill_errors_total", 1, labels);
            throw;
        }
    }

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

    private static List<CryptoIndicator> ConvertToIndicators(
        List<TimestampedValue> values, string indicatorType, int tickerId, int dataSourceId)
    {
        return values.Select(v =>
        {
            var indicator = new CryptoIndicator
            {
                CryptoTickerId = tickerId,
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

    private class TimestampedValue
    {
        public long Timestamp { get; set; }
        public string IndicatorType { get; set; } = string.Empty;
        public decimal? Value { get; set; }
        public decimal? MacdValue { get; set; }
        public decimal? MacdSignal { get; set; }
        public decimal? MacdHistogram { get; set; }
    }

    /// <summary>
    /// Filters to 15-minute boundaries only. No market hours restriction for crypto (24/7).
    /// </summary>
    private static List<T> FilterTo15MinBoundaries<T>(List<T>? values) where T : class
    {
        if (values == null || values.Count == 0)
            return new List<T>();

        Func<T, long> getTimestamp = values.First() switch
        {
            MassiveIndicatorValue => v => ((MassiveIndicatorValue)(object)v).Timestamp,
            MassiveMacdValue => v => ((MassiveMacdValue)(object)v).Timestamp,
            TimestampedValue => v => ((TimestampedValue)(object)v).Timestamp,
            _ => throw new ArgumentException($"Unsupported type: {typeof(T).Name}")
        };

        return values.Where(v =>
        {
            var dt = DateTimeOffset.FromUnixTimeMilliseconds(getTimestamp(v));
            return dt.Minute % 15 == 0;
        }).ToList();
    }

    private static CryptoIndicator GetOrCreate(Dictionary<long, CryptoIndicator> dict, long timestamp, int tickerId, int dataSourceId)
    {
        if (!dict.TryGetValue(timestamp, out var indicator))
        {
            indicator = new CryptoIndicator
            {
                CryptoTickerId = tickerId,
                DataSourceId = dataSourceId,
                IndicatorTime = DateTimeOffset.FromUnixTimeMilliseconds(timestamp).UtcDateTime
            };
            dict[timestamp] = indicator;
        }
        return indicator;
    }

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
