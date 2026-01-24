using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;

namespace TwelveData.Worker.Services;

/// <summary>
/// Service for executing historical data backfill operations
/// Uses the formula: (390 / N) * 22 * 6 for calculating total data points
/// Where N = interval in minutes (default: 15)
/// </summary>
public class HistoricalBackfillService : IHistoricalBackfillService
{
    private readonly ITwelveDataApiClient _apiClient;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IStockPriceRepository _priceRepository;
    private readonly BackfillSettings _settings;
    private readonly ILogger<HistoricalBackfillService> _logger;
    private readonly IMetricsClient _metrics;
    
    private const string DataSourceName = "TwelveData";

    public HistoricalBackfillService(
        ITwelveDataApiClient apiClient,
        IStockTickerRepository tickerRepository,
        IStockPriceRepository priceRepository,
        IOptions<BackfillSettings> settings,
        ILogger<HistoricalBackfillService> logger,
        IMetricsClient metrics)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<BackfillResult> ExecuteBackfillAsync(BackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new BackfillResult
        {
            Symbol = request.Symbol
        };
        
        var stopwatch = Stopwatch.StartNew();
        
        _logger.LogInformation(
            "Starting historical backfill for {Symbol} - Total data points needed: {DataPoints}, Requires batching: {RequiresBatching}",
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
            var ticker = await _tickerRepository.GetOrCreateTickerAsync(
                request.Symbol, 
                request.Exchange, 
                "USD");
            
            _logger.LogInformation("Using ticker {Symbol} (ID: {Id}) for backfill", ticker.Symbol, ticker.Id);

            // Execute the backfill
            var totalRecords = await ExecuteBackfillInternalAsync(
                ticker, 
                dataSource.Id, 
                request.Exchange, 
                cancellationToken);

            stopwatch.Stop();
            
            result.Success = true;
            result.TotalRecordsInserted = totalRecords.recordsInserted;
            result.BatchesProcessed = totalRecords.batchCount;
            result.Duration = stopwatch.Elapsed;

            _logger.LogInformation(
                "Backfill completed for {Symbol}: {Records} records in {Batches} batches, Duration: {Duration:F1}s",
                request.Symbol,
                result.TotalRecordsInserted,
                result.BatchesProcessed,
                result.Duration.TotalSeconds);

            // Record success metrics
            await _metrics.IncrementCounterAsync("backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["status"] = "success"
                });
            
            await _metrics.IncrementCounterAsync("backfill_records_inserted_total", result.TotalRecordsInserted,
                new Dictionary<string, string> { ["symbol"] = request.Symbol });
            
            await _metrics.ObserveHistogramAsync("backfill_duration_seconds",
                result.Duration.TotalSeconds,
                new Dictionary<string, string> { ["symbol"] = request.Symbol });
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            
            result.Success = false;
            result.Error = ex.Message;
            result.Duration = stopwatch.Elapsed;

            _logger.LogError(ex, "Backfill failed for {Symbol} after {Duration:F1}s", 
                request.Symbol, result.Duration.TotalSeconds);

            // Record error metrics
            await _metrics.IncrementCounterAsync("backfill_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["status"] = "error"
                });
            
            await _metrics.IncrementCounterAsync("backfill_errors_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = request.Symbol,
                    ["error_type"] = ex.GetType().Name
                });
        }

        return result;
    }

    private async Task<(int recordsInserted, int batchCount)> ExecuteBackfillInternalAsync(
        StockTicker ticker,
        int dataSourceId,
        string exchange,
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
            "Backfill parameters - TotalPoints: {Total}, MaxPerRequest: {Max}, Interval: {Interval}",
            totalDataPoints, maxPerRequest, interval);

        while (pointsFetched < totalDataPoints)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Backfill cancelled for {Symbol} after {Batches} batches", 
                    ticker.Symbol, batchCount);
                break;
            }

            // Calculate batch size (remaining points or max, whichever is smaller)
            var batchSize = Math.Min(maxPerRequest, totalDataPoints - pointsFetched);
            batchCount++;

            _logger.LogInformation(
                "Fetching batch {Batch} for {Symbol}: outputsize={Size}, endDate={EndDate}",
                batchCount, ticker.Symbol, batchSize, endDate ?? "none");

            // Fetch data from TwelveData API
            var response = await _apiClient.GetHistoricalTimeSeriesAsync(
                ticker.Symbol,
                interval,
                batchSize,
                exchange,
                endDate,
                cancellationToken);

            if (response?.Values == null || response.Values.Count == 0)
            {
                _logger.LogWarning(
                    "No data returned for {Symbol} batch {Batch} - may have reached end of available history",
                    ticker.Symbol, batchCount);
                break;
            }

            // Convert and store the data
            var prices = response.Values.Select(value => new StockPrice
            {
                StockTickerId = ticker.Id,
                DataSourceId = dataSourceId,
                PriceTime = TwelveDataApiClient.ConvertToUtc(value.Datetime),
                OpenPrice = TwelveDataApiClient.ParseDecimal(value.Open),
                HighPrice = TwelveDataApiClient.ParseDecimal(value.High),
                LowPrice = TwelveDataApiClient.ParseDecimal(value.Low),
                ClosePrice = TwelveDataApiClient.ParseDecimal(value.Close),
                Volume = TwelveDataApiClient.ParseLong(value.Volume)
            }).ToList();

            // Batch upsert for better performance
            await _priceRepository.UpsertStockPricesBatchAsync(prices);
            
            var recordsInBatch = prices.Count;
            totalRecordsInserted += recordsInBatch;
            pointsFetched += recordsInBatch;

            _logger.LogInformation(
                "Batch {Batch} complete for {Symbol}: {Records} records inserted, Total so far: {Total}/{Target}",
                batchCount, ticker.Symbol, recordsInBatch, pointsFetched, totalDataPoints);

            // Check if we got fewer records than requested - indicates end of available data
            if (recordsInBatch < batchSize)
            {
                _logger.LogInformation(
                    "Received {Actual} records (requested {Requested}) - reached end of available history for {Symbol}",
                    recordsInBatch, batchSize, ticker.Symbol);
                break;
            }

            // Calculate end_date for next batch using the oldest datetime from this batch
            // Response values are ordered most recent first, so Last() is the oldest
            var oldestDatetime = response.Values.Last().Datetime;
            endDate = TwelveDataApiClient.CalculateNextBatchEndDate(oldestDatetime, intervalMinutes);

            _logger.LogDebug(
                "Next batch end_date calculated: {EndDate} (oldest from this batch: {Oldest})",
                endDate, oldestDatetime);

            // Rate limiting between API calls
            if (pointsFetched < totalDataPoints)
            {
                _logger.LogDebug("Rate limiting: waiting {Seconds}s before next batch", 
                    _settings.RateLimitDelaySeconds);
                await Task.Delay(TimeSpan.FromSeconds(_settings.RateLimitDelaySeconds), cancellationToken);
            }
        }

        return (totalRecordsInserted, batchCount);
    }
}
