using System.Diagnostics;
using AlphaVantage.Worker.Configuration;
using AlphaVantage.Worker.Models;
using AlphaVantage.Worker.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;
using StockTracker.Common.Services;

namespace AlphaVantage.Worker.Services;

public class StockFetchService : IStockFetchService
{
    private readonly IAlphaVantageApiClient _apiClient;
    private readonly IStockRepository _stockRepository;
    private readonly IFetchLogRepository _fetchLogRepository;
    private readonly IMetricsClient _metricsClient;
    private readonly WorkerStateService _workerState;
    private readonly AlphaVantageSettings _settings;
    private readonly ILogger<StockFetchService> _logger;
    
    private const string DataSourceName = "AlphaVantage";

    public StockFetchService(
        IAlphaVantageApiClient apiClient,
        IStockRepository stockRepository,
        IFetchLogRepository fetchLogRepository,
        IMetricsClient metricsClient,
        WorkerStateService workerState,
        IOptions<AlphaVantageSettings> settings,
        ILogger<StockFetchService> logger)
    {
        _apiClient = apiClient;
        _stockRepository = stockRepository;
        _fetchLogRepository = fetchLogRepository;
        _metricsClient = metricsClient;
        _workerState = workerState;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task FetchAndStoreStockDataAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting stock data fetch for {Count} symbols", _settings.Symbols.Length);
        
        // Get the data source
        var dataSource = await _stockRepository.GetDataSourceByNameAsync(DataSourceName);
        if (dataSource == null)
        {
            _logger.LogError("Data source '{DataSource}' not found in database", DataSourceName);
            return;
        }

        // Start fetch log
        var logId = await _fetchLogRepository.StartFetchLogAsync(dataSource.Id, "stock");
        var totalRecords = 0;

        try
        {
            foreach (var symbol in _settings.Symbols)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Cancellation requested, stopping fetch");
                    break;
                }

                try
                {
                    _workerState.SetCurrentOperation($"Fetching {symbol}");
                    var recordsInserted = await FetchSymbolDataAsync(symbol, dataSource.Id, cancellationToken);
                    totalRecords += recordsInserted;
                    
                    // Alpha Vantage free tier allows 5 API calls per minute
                    // Wait between calls to avoid rate limiting
                    await Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error fetching data for symbol {Symbol}", symbol);
                    _workerState.SetOperationError();
                    await _metricsClient.RecordOperationFailedAsync("fetch", ex.GetType().Name, 
                        new Dictionary<string, string> { ["symbol"] = symbol });
                    // Continue with other symbols
                }
            }

            await _fetchLogRepository.CompleteFetchLogAsync(logId, totalRecords);
            _workerState.SetOperationCompleted();
            _logger.LogInformation("Completed stock data fetch. Total records: {TotalRecords}", totalRecords);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during stock data fetch");
            await _fetchLogRepository.FailFetchLogAsync(logId, ex.Message);
            throw;
        }
    }

    public async Task<int> FetchSymbolAsync(string symbol, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Fetching data for single symbol: {Symbol}", symbol);
        
        var dataSource = await _stockRepository.GetDataSourceByNameAsync(DataSourceName);
        if (dataSource == null)
        {
            throw new InvalidOperationException($"Data source '{DataSourceName}' not found in database");
        }

        return await FetchSymbolDataAsync(symbol, dataSource.Id, cancellationToken);
    }

    private async Task<int> FetchSymbolDataAsync(string symbol, Guid dataSourceId, CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        await _metricsClient.RecordOperationStartedAsync("fetch", 
            new Dictionary<string, string> { ["symbol"] = symbol });
        
        _logger.LogDebug("Fetching data for {Symbol}", symbol);
        
        // Ensure stock exists in database
        var stock = await _stockRepository.GetBySymbolAsync(symbol);
        if (stock == null)
        {
            _logger.LogInformation("Creating stock record for {Symbol}", symbol);
            stock = await _stockRepository.CreateStockAsync(symbol);
        }

        // Fetch daily prices (compact = last 100 data points)
        var apiStopwatch = Stopwatch.StartNew();
        var dailyPrices = await _apiClient.GetDailyPricesAsync(symbol, compact: true, cancellationToken);
        apiStopwatch.Stop();
        
        await _metricsClient.ObserveHistogramAsync("api_call_duration_seconds", apiStopwatch.Elapsed.TotalSeconds,
            new Dictionary<string, string> { ["endpoint"] = "daily_prices", ["success"] = (dailyPrices != null).ToString().ToLower() });
        
        if (dailyPrices == null || dailyPrices.Count == 0)
        {
            _logger.LogWarning("No price data returned for {Symbol}", symbol);
            await _metricsClient.RecordOperationFailedAsync("fetch", "NoData",
                new Dictionary<string, string> { ["symbol"] = symbol });
            return 0;
        }

        var recordsInserted = 0;

        foreach (var (date, priceData) in dailyPrices)
        {
            priceData.StockId = stock.Id;
            priceData.DataSourceId = dataSourceId;
            
            try
            {
                // Upsert to handle both new and updated data
                await _stockRepository.UpsertStockPriceAsync(priceData);
                recordsInserted++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error inserting price for {Symbol} on {Date}", symbol, date);
            }
        }

        stopwatch.Stop();
        await _metricsClient.RecordOperationCompletedAsync("fetch", stopwatch.Elapsed.TotalSeconds,
            new Dictionary<string, string> { ["symbol"] = symbol });
        
        await _metricsClient.IncrementCounterAsync("records_fetched_total", recordsInserted,
            new Dictionary<string, string> { ["symbol"] = symbol });
        
        _logger.LogInformation("Inserted/Updated {Count} price records for {Symbol} in {Duration}s", 
            recordsInserted, symbol, stopwatch.Elapsed.TotalSeconds);
        return recordsInserted;
    }
}
