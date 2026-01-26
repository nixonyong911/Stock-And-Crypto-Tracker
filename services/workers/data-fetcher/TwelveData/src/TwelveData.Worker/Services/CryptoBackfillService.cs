using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;
using StockTracker.Data.Entities;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;

namespace TwelveData.Worker.Services;

/// <summary>
/// Service for executing crypto historical data backfill operations.
/// Uses the formula: (1440 / N) * 30 * 6 for calculating total data points
/// Where N = interval in minutes (default: 15), accounting for 24/7 crypto trading.
/// </summary>
public class CryptoBackfillService : ICryptoBackfillService
{
    private readonly ITwelveDataApiClient _apiClient;
    private readonly ICryptoTickerRepository _tickerRepository;
    private readonly ICryptoPriceRepository _priceRepository;
    private readonly CryptoBackfillSettings _settings;
    private readonly ILogger<CryptoBackfillService> _logger;
    private readonly IMetricsClient _metrics;

    private const string DataSourceName = "TwelveData";

    public CryptoBackfillService(
        ITwelveDataApiClient apiClient,
        ICryptoTickerRepository tickerRepository,
        ICryptoPriceRepository priceRepository,
        IOptions<CryptoBackfillSettings> settings,
        ILogger<CryptoBackfillService> logger,
        IMetricsClient metrics)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<CryptoBackfillResult> ExecuteBackfillAsync(CryptoBackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new CryptoBackfillResult
        {
            Symbol = request.Symbol
        };

        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation(
            "Starting crypto historical backfill for {Symbol} - Total data points needed: {DataPoints}, Requires batching: {RequiresBatching}",
            request.Symbol,
            _settings.CalculateTotalDataPoints(),
            _settings.RequiresBatching());

        try
        {
            // Get the data source
            var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
            if (dataSource == null)
            {
                throw new InvalidOperationException($"Data source '{DataSourceName}' not found in database.");
            }

            // Get or create the ticker
            var ticker = await _tickerRepository.GetOrCreateTickerAsync(request.Symbol);

            _logger.LogInformation("Using crypto ticker {Symbol} (ID: {Id}) for backfill", ticker.Symbol, ticker.Id);

            // Execute the backfill
            var totalRecords = await ExecuteBackfillInternalAsync(
                ticker,
                dataSource.Id,
                cancellationToken);

            stopwatch.Stop();

            result.Success = true;
            result.TotalRecordsInserted = totalRecords.recordsInserted;
            result.BatchesProcessed = totalRecords.batchCount;
            result.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Crypto backfill completed for {Symbol}: {Records} records in {Batches} batches, Duration: {Duration:F1}s",
                request.Symbol,
                result.TotalRecordsInserted,
                result.BatchesProcessed,
                result.Duration.TotalSeconds);

            // Record success metrics
            await _metrics.IncrementCounterAsync("crypto_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["status"] = "success"
                });

            await _metrics.IncrementCounterAsync("crypto_backfill_records_inserted_total", result.TotalRecordsInserted,
                new Dictionary<string, string> { ["symbol"] = request.Symbol });

            await _metrics.ObserveHistogramAsync("crypto_backfill_duration_seconds",
                result.Duration.TotalSeconds,
                new Dictionary<string, string> { ["symbol"] = request.Symbol });
        }
        catch (Exception ex)
        {
            stopwatch.Stop();

            result.Success = false;
            result.Error = ex.Message;
            result.Duration = stopwatch.Elapsed;

            _logger.LogError(ex, "Crypto backfill failed for {Symbol} after {Duration:F1}s",
                request.Symbol, result.Duration.TotalSeconds);

            // Record error metrics
            await _metrics.IncrementCounterAsync("crypto_backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["status"] = "error"
                });

            await _metrics.IncrementCounterAsync("crypto_backfill_errors_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["error_type"] = ex.GetType().Name
                });
        }

        return result;
    }

    private async Task<(int recordsInserted, int batchCount)> ExecuteBackfillInternalAsync(
        CryptoTicker ticker,
        int dataSourceId,
        CancellationToken cancellationToken)
    {
        var totalDataPoints = _settings.CalculateTotalDataPoints();
        var maxPerRequest = _settings.MaxOutputSizePerRequest;
        var interval = _settings.GetIntervalString();
        var intervalMinutes = _settings.IntervalMinutes;

        var pointsFetched = 0;
        var totalRecordsInserted = 0;
        var batchCount = 0;
        string? endDate = null;

        _logger.LogDebug(
            "Crypto backfill parameters - TotalPoints: {Total}, MaxPerRequest: {Max}, Interval: {Interval}",
            totalDataPoints, maxPerRequest, interval);

        // Use CryptoFetchConfig for API calls
        var config = new CryptoFetchConfig
        {
            Interval = interval,
            OutputSize = maxPerRequest,
            Timezone = "UTC"
        };

        while (pointsFetched < totalDataPoints)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Crypto backfill cancelled for {Symbol} after {Batches} batches",
                    ticker.Symbol, batchCount);
                break;
            }

            // Calculate batch size (remaining points or max, whichever is smaller)
            var batchSize = Math.Min(maxPerRequest, totalDataPoints - pointsFetched);
            batchCount++;
            config.OutputSize = batchSize;
            config.EndDate = endDate;

            _logger.LogInformation(
                "Fetching crypto batch {Batch} for {Symbol}: outputsize={Size}, endDate={EndDate}",
                batchCount, ticker.Symbol, batchSize, endDate ?? "none");

            // Fetch data from TwelveData API
            var response = await _apiClient.GetCryptoTimeSeriesAsync(ticker.Symbol, config, cancellationToken);

            if (response?.Values == null || response.Values.Count == 0)
            {
                _logger.LogWarning(
                    "No data returned for crypto {Symbol} batch {Batch} - may have reached end of available history",
                    ticker.Symbol, batchCount);
                break;
            }

            // Convert API response to CryptoPrice entities
            var prices = response.Values.Select(value => new CryptoPrice
            {
                CryptoTickerId = ticker.Id,
                DataSourceId = dataSourceId,
                PriceTime = TwelveDataApiClient.ConvertUtcString(value.Datetime),
                OpenPrice = TwelveDataApiClient.ParseDecimal(value.Open),
                HighPrice = TwelveDataApiClient.ParseDecimal(value.High),
                LowPrice = TwelveDataApiClient.ParseDecimal(value.Low),
                ClosePrice = TwelveDataApiClient.ParseDecimal(value.Close),
                Volume = TwelveDataApiClient.ParseDecimal(value.Volume),
                MarketCap = null  // TwelveData time_series doesn't include market cap
            }).ToList();

            // Store data using optimized multi-value INSERT (batched internally)
            _logger.LogDebug("Storing {Count} crypto records for {Symbol}...", prices.Count, ticker.Symbol);
            await _priceRepository.UpsertCryptoPricesBatchAsync(prices);

            var recordsInBatch = prices.Count;
            totalRecordsInserted += recordsInBatch;
            pointsFetched += recordsInBatch;

            _logger.LogInformation(
                "Crypto batch {Batch} complete for {Symbol}: {Records} records inserted, Total so far: {Total}/{Target}",
                batchCount, ticker.Symbol, recordsInBatch, pointsFetched, totalDataPoints);

            // Check if we got fewer records than requested - indicates end of available data
            if (recordsInBatch < batchSize)
            {
                _logger.LogInformation(
                    "Received {Actual} records (requested {Requested}) - reached end of available history for crypto {Symbol}",
                    recordsInBatch, batchSize, ticker.Symbol);
                break;
            }

            // Calculate end_date for next batch using the oldest datetime from this batch
            // Response values are ordered most recent first, so Last() is the oldest
            var oldestDatetime = response.Values.Last().Datetime;
            endDate = TwelveDataApiClient.CalculateNextBatchEndDate(oldestDatetime, intervalMinutes);

            _logger.LogDebug(
                "Next crypto batch end_date calculated: {EndDate} (oldest from this batch: {Oldest})",
                endDate, oldestDatetime);

            // Rate limiting between API calls
            if (pointsFetched < totalDataPoints)
            {
                _logger.LogDebug("Rate limiting: waiting {Seconds}s before next crypto batch",
                    _settings.RateLimitDelaySeconds);
                await Task.Delay(TimeSpan.FromSeconds(_settings.RateLimitDelaySeconds), cancellationToken);
            }
        }

        return (totalRecordsInserted, batchCount);
    }
}
